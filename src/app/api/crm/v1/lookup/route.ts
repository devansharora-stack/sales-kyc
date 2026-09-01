import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { researchJobs, researchSteps } from "@/db/schema";
import { and, eq, inArray, ilike } from "drizzle-orm";
import { requireCrmKey } from "@/lib/crm-auth";
import { resolveCompany, resolveStakeholder } from "@/lib/crm-resolve";
import { getCrmProjectAndUser } from "@/lib/crm-project";
import { inngest } from "@/lib/inngest";
import { cleanDomain } from "@/lib/company-match";

// Same 13-step pipeline the app uses, so CRM-triggered research runs identically.
const AGENT_STEPS = [
  { agent_name: "company_profile", phase: 1 },
  { agent_name: "tech_stack", phase: 1 },
  { agent_name: "financial_signal", phase: 1 },
  { agent_name: "trigger_scanner", phase: 2 },
  { agent_name: "pain_point_analyzer", phase: 2 },
  { agent_name: "stakeholder_researcher", phase: 2 },
  { agent_name: "partner_landscape", phase: 2 },
  { agent_name: "solution_mapper", phase: 3 },
  { agent_name: "gtm_generator", phase: 3 },
  { agent_name: "scoring_agent", phase: 3 },
  { agent_name: "sales_intelligence", phase: 3 },
  { agent_name: "stakeholder_offering_mapper", phase: 3 },
  { agent_name: "verification", phase: 4 },
];

/**
 * POST /api/crm/v1/lookup
 * Body: { company?, domain?, contactName?, contactEmail?, linkedinUrl?, autoResearch? }
 * Resolves a company (and optionally a contact) from existing KYC research.
 *  - hit  → { status: "ready", company, stakeholder? }
 *  - miss → autoResearch (default true) kicks the pipeline and returns
 *           { status: "researching", jobId } to poll via /api/crm/v1/status.
 */
export async function POST(request: NextRequest) {
  const denied = requireCrmKey(request);
  if (denied) return denied;

  let body: {
    company?: string;
    domain?: string;
    contactName?: string;
    contactEmail?: string;
    linkedinUrl?: string;
    autoResearch?: boolean;
    // Attribution passthrough: the CRM's own salesperson id / free-form context.
    // Stashed on research_jobs.company_context (jsonb) so CRM-triggered spend is
    // traceable to who asked, without a schema change or a Google login.
    crmUserId?: string;
    crmContext?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  const domain = typeof body.domain === "string" ? cleanDomain(body.domain) : "";
  if (!company && !domain) {
    return NextResponse.json({ error: "Provide 'company' or 'domain'" }, { status: 400 });
  }

  const hit = await resolveCompany(company || undefined, domain || undefined);

  if (hit) {
    const { row, matchType } = hit;
    let stakeholder = null;
    if (body.contactName || body.linkedinUrl) {
      const sh = await resolveStakeholder(row.id, {
        name: (body.contactName || "").trim(),
        company: row.data?.name,
        linkedinUrl: body.linkedinUrl,
      });
      if (sh) {
        stakeholder = {
          id: sh.row.id,
          name: sh.row.name,
          title: sh.row.title,
          matchType: sh.matchType,
          researched: sh.row.status === "completed",
        };
      }
    }
    return NextResponse.json({
      status: "ready",
      matchType,
      company: {
        profileId: row.id,
        projectId: row.projectId,
        slug: row.slug,
        name: row.data?.name ?? row.slug,
        geminiStatus: row.geminiStatus,
      },
      stakeholder,
      links: {
        company: `/api/crm/v1/company?slug=${encodeURIComponent(row.slug)}`,
        prep: body.contactName
          ? `/api/crm/v1/prep?slug=${encodeURIComponent(row.slug)}&contact=${encodeURIComponent(body.contactName)}`
          : null,
      },
    });
  }

  // Miss — optionally trigger research.
  if (body.autoResearch === false) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const companyName = company || domain;
  const { userId, projectId } = await getCrmProjectAndUser();

  // Don't double-trigger: reuse an in-flight job for the same company name.
  const [active] = await db
    .select({ id: researchJobs.id })
    .from(researchJobs)
    .where(
      and(
        eq(researchJobs.projectId, projectId),
        ilike(researchJobs.companyName, companyName),
        inArray(researchJobs.status, ["queued", "running"])
      )
    );
  if (active) {
    return NextResponse.json({ status: "researching", jobId: active.id, reused: true, poll: `/api/crm/v1/status?jobId=${active.id}` });
  }

  // Job context carries the domain (for research pinning) AND the CRM attribution
  // (for spend traceability). Only the domain is forwarded to the pipeline event.
  const crm =
    body.crmUserId || body.crmContext
      ? { source: "crm", crmUserId: body.crmUserId ?? null, ...(body.crmContext ? { crmContext: body.crmContext } : {}) }
      : { source: "crm" };
  const companyContext = { ...(domain ? { domain } : {}), crm };
  const [job] = await db
    .insert(researchJobs)
    .values({ projectId, userId, companyName, companyContext })
    .returning();

  await db.insert(researchSteps).values(
    AGENT_STEPS.map((step) => ({ jobId: job.id, agentName: step.agent_name, phase: step.phase }))
  );

  await inngest.send({
    name: "research/company.start",
    data: { jobId: job.id, companyName, ...(domain ? { companyContext: { domain } } : {}) },
  });

  return NextResponse.json({ status: "researching", jobId: job.id, poll: `/api/crm/v1/status?jobId=${job.id}` });
}
