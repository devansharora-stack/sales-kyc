import { NextResponse, type NextRequest } from "next/server";
import { requireCrmKey } from "@/lib/crm-auth";
import { resolveCompany, resolveCompanyBySlug, resolveStakeholder, buildPrepSheet } from "@/lib/crm-resolve";
import { cleanDomain } from "@/lib/company-match";

/**
 * GET /api/crm/v1/prep?contact=  (slug=|company=|domain=)  [&linkedinUrl=&projectId=]
 * Per-contact meeting prep: persona + engagement + recommended offerings,
 * assembled deterministically from stored research (no LLM). When the contact
 * isn't deep-researched yet, persona is null but companyContext + solutions
 * still come back (status: "partial").
 */
export async function GET(request: NextRequest) {
  const denied = requireCrmKey(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim();
  const company = searchParams.get("company")?.trim();
  const domain = searchParams.get("domain")?.trim();
  const projectId = searchParams.get("projectId")?.trim() || undefined;
  const contact = searchParams.get("contact")?.trim();
  const linkedinUrl = searchParams.get("linkedinUrl")?.trim() || undefined;

  if (!contact && !linkedinUrl) {
    return NextResponse.json({ error: "Provide 'contact' (name) or 'linkedinUrl'" }, { status: 400 });
  }

  // Resolve the company profile.
  let row = null;
  if (slug) {
    row = await resolveCompanyBySlug(slug, projectId);
  } else if (company || domain) {
    const hit = await resolveCompany(company || undefined, domain ? cleanDomain(domain) : undefined);
    row = hit?.row ?? null;
  } else {
    return NextResponse.json({ error: "Provide 'slug', 'company', or 'domain'" }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ status: "not_found", reason: "company not researched" }, { status: 404 });
  }

  // Resolve the contact under that company.
  const sh = await resolveStakeholder(row.id, {
    name: contact || "",
    company: row.data?.name,
    linkedinUrl,
  });

  const prep = buildPrepSheet(row.data, sh?.row);
  const researched = !!prep.persona;

  return NextResponse.json({
    status: researched ? "ready" : "partial",
    company: { profileId: row.id, projectId: row.projectId, slug: row.slug, name: row.data?.name ?? row.slug },
    contactMatched: sh ? { matchType: sh.matchType } : null,
    prep,
  });
}
