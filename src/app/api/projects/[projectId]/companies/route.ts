import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, researchJobs, researchSteps, companyProfiles } from "@/db/schema";
import { and, eq, gte, desc, inArray, sql } from "drizzle-orm";
import { serializeJob } from "@/lib/serializers";
import { inngest } from "@/lib/inngest";
import { canReadResource } from "@/lib/access";
import { matchCompany, cleanDomain, type MatchCandidate, type MatchType } from "@/lib/company-match";
import type { CompanyDetail } from "@/lib/types";

/**
 * Extract company name (and root domain) from a URL by fetching the page title.
 * Falls back to the domain name if fetch fails.
 */
async function extractCompanyFromUrl(url: string): Promise<{ name: string; domain: string }> {
  let domain = "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    domain = parsed.hostname.replace(/^www\./, "");
    const domainBase = domain.split(".")[0].toLowerCase();

    // Try fetching the page to get the title
    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KYCGenie/1.0)" },
    });

    if (res.ok) {
      const html = await res.text();

      function decodeEntities(s: string): string {
        return s
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
          .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/[®™©]/g, "").trim();
      }

      // Priority 1: og:site_name — almost always the real company name
      const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
      if (ogSiteName) {
        const name = decodeEntities(ogSiteName[1]);
        if (name.length >= 2 && name.length <= 100) {
          return { name, domain };
        }
      }

      // Priority 2: <title> tag with smarter parsing
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        const title = decodeEntities(titleMatch[1]);
        const parts = title.split(/\s*[|\-–—:]\s*/).map(p => p.trim()).filter(Boolean);

        if (parts.length > 1) {
          // If any part resembles the domain name, prefer that (e.g., "NextEra Energy" from nexteraenergy.com)
          const domainMatch = parts.find(p => domainBase.includes(p.toLowerCase().replace(/\s+/g, "")));
          if (domainMatch && domainMatch.length >= 2 && domainMatch.length <= 100) return { name: domainMatch, domain };

          // Otherwise, the company name is usually the shortest part (taglines are longer)
          const sorted = [...parts].sort((a, b) => a.length - b.length);
          const shortest = sorted[0];
          if (shortest.length >= 2 && shortest.length <= 100) return { name: shortest, domain };
        }

        // Single-part title — check if it looks like a tagline (4+ words, all lowercase style)
        const wordCount = parts[0]?.split(/\s+/).length || 0;
        if (wordCount <= 4 && parts[0].length >= 2 && parts[0].length <= 100) {
          return { name: parts[0], domain };
        }
      }
    }

    // Fallback: capitalize domain name (e.g., "nexteraenergy" → "Nexteraenergy")
    // Try to split camelCase or known patterns
    const fallback = domainBase.replace(/([a-z])([A-Z])/g, "$1 $2");
    return { name: fallback.charAt(0).toUpperCase() + fallback.slice(1), domain };
  } catch {
    // Last resort: clean the URL into something usable
    const cleaned = url.replace(/^https?:\/\/(www\.)?/, "").split(/[./]/)[0];
    return { name: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), domain };
  }
}

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input) || /^www\./i.test(input) || /\.[a-z]{2,}$/i.test(input);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const shareToken = searchParams.get("shareToken");

  // If slug is provided, return full profile data for a single company
  if (slug) {
    const [profile] = await db
      .select()
      .from(companyProfiles)
      .where(and(eq(companyProfiles.projectId, projectId), eq(companyProfiles.slug, slug)));

    if (!profile) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Read allowed if owner, a company-scoped share for this profile, or a
    // project-scoped share covering it.
    const allowed = await canReadResource({
      email: session.user.email,
      resourceType: "company",
      resourceId: profile.id,
      shareToken,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({
      profiles: [
        {
          id: profile.id,
          slug: profile.slug,
          total_score: profile.totalScore,
          rating: profile.rating,
          industry: profile.industry,
          urgency: profile.urgency,
          primary_solution: profile.primarySolution,
          gemini_status: profile.geminiStatus,
          data: profile.data,
        },
      ],
      jobs: [],
    });
  }

  // Full-list read requires owner or a whole-project share (a single-company
  // share does not expose the rest of the project).
  const allowedList = await canReadResource({
    email: session.user.email,
    resourceType: "project",
    resourceId: projectId,
    shareToken,
  });
  if (!allowedList) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Self-heal: a job's terminal "mark completed" write runs in a separate Inngest
  // step after the profile is saved; if that step is interrupted, the job is left
  // at running/queued forever and lingers in "Active Research" even though it's
  // done. Reconcile any such job (a profile exists) to completed on load.
  await db.execute(sql`
    update sales_kyc.research_jobs j
    set status = 'completed', progress = 100, completed_at = coalesce(j.completed_at, now())
    where j.project_id = ${projectId}
      and j.status in ('queued', 'running')
      and exists (select 1 from sales_kyc.company_profiles p where p.job_id = j.id)
  `);

  // Profiles and jobs are independent — fetch in parallel to cut the
  // (region-distant) DB round-trips on this hot path.
  const [profileRows, jobRows] = await Promise.all([
    db
      .select({
        id: companyProfiles.id,
        slug: companyProfiles.slug,
        total_score: companyProfiles.totalScore,
        rating: companyProfiles.rating,
        industry: companyProfiles.industry,
        urgency: companyProfiles.urgency,
        primary_solution: companyProfiles.primarySolution,
        gemini_status: companyProfiles.geminiStatus,
        data: companyProfiles.data,
      })
      .from(companyProfiles)
      .where(eq(companyProfiles.projectId, projectId))
      .orderBy(desc(companyProfiles.totalScore)),
    db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.projectId, projectId))
      .orderBy(desc(researchJobs.createdAt)),
  ]);

  const profilesList = profileRows.map((p) => {
    const d = (p.data || {}) as Partial<CompanyDetail>;
    return {
      id: p.id,
      slug: p.slug,
      total_score: p.total_score,
      rating: p.rating,
      industry: p.industry,
      urgency: p.urgency,
      primary_solution: p.primary_solution,
      gemini_status: p.gemini_status,
      name: d.name,
      fullName: d.fullName,
      hqCity: d.hqCity,
      state: d.state,
      execSummary: d.execSummary,
      salesIntelligence: d.salesIntelligence,
    };
  });

  const jobIds = jobRows.map((j) => j.id);
  const stepRows = jobIds.length
    ? await db.select().from(researchSteps).where(inArray(researchSteps.jobId, jobIds))
    : [];
  const stepsByJob = new Map<string, typeof stepRows>();
  for (const s of stepRows) {
    const arr = stepsByJob.get(s.jobId!) || [];
    arr.push(s);
    stepsByJob.set(s.jobId!, arr);
  }

  return NextResponse.json({
    profiles: profilesList,
    jobs: jobRows.map((j) => serializeJob(j, stepsByJob.get(j.id) || [])),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const body = await request.json();
  const rawCompanies = body.companies || [];

  // Each item may be a plain string (name or URL) OR a { name, domain } object
  // — the disambiguation picker sends the chosen candidate as an object so its
  // domain anchors research directly, no re-fetch.
  const companyInputs: { name: string; domain?: string }[] = [];
  for (const raw of Array.isArray(rawCompanies) ? rawCompanies : []) {
    if (raw && typeof raw === "object" && typeof raw.name === "string") {
      const nm = raw.name.trim();
      const dom = typeof raw.domain === "string" ? cleanDomain(raw.domain) : "";
      if (nm && nm.length <= 500) companyInputs.push({ name: nm, domain: dom || undefined });
      continue;
    }
    if (typeof raw !== "string") continue;
    const input = raw.trim();
    if (!input || input.length > 500) continue;
    if (looksLikeUrl(input)) {
      const { name, domain } = await extractCompanyFromUrl(input);
      console.log(`[companies] Resolved URL "${input}" → "${name}" (${domain})`);
      companyInputs.push({ name, domain: domain || undefined });
    } else {
      companyInputs.push({ name: input });
    }
  }

  if (companyInputs.length === 0) {
    return NextResponse.json({ error: "No valid companies provided" }, { status: 400 });
  }

  // Get user
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Create research jobs for each company
  const agentSteps = [
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

  const CACHE_MAX_AGE_DAYS = 7;
  const forceRefresh = body.forceRefresh === true;
  // When the user has been shown the "already researched" prompt and chose
  // "Use existing", the frontend re-POSTs with reuse:true to copy the cached
  // profile. Without reuse (and without forceRefresh) we only DETECT a cache
  // hit and report it back so the frontend can ask first.
  const reuse = body.reuse === true;

  const jobs = [];
  const existing: {
    company_name: string;
    matched_name: string;
    slug: string;
    updated_at: Date | null;
    days_old: number | null;
    source_project: string | null;
    match_type: MatchType;
  }[] = [];

  // Fetch all recently-researched profiles ONCE, then match each input against
  // them in-app (domain / exact / fuzzy). Matching only the exact normalized
  // name let variants ("Darling" vs "Darling Ingredients" vs typos) slip past
  // and trigger duplicate research.
  type CachedRow = {
    slug: string;
    jobId: string | null;
    data: unknown;
    totalScore: number | null;
    rating: string | null;
    industry: string | null;
    urgency: string | null;
    primarySolution: string | null;
    geminiStatus: string | null;
    updatedAt: Date | null;
    projectName: string | null;
  };
  let candidateRows: CachedRow[] = [];
  if (!forceRefresh) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_AGE_DAYS);
    candidateRows = await db
      .select({
        slug: companyProfiles.slug,
        jobId: companyProfiles.jobId,
        data: companyProfiles.data,
        totalScore: companyProfiles.totalScore,
        rating: companyProfiles.rating,
        industry: companyProfiles.industry,
        urgency: companyProfiles.urgency,
        primarySolution: companyProfiles.primarySolution,
        geminiStatus: companyProfiles.geminiStatus,
        updatedAt: companyProfiles.updatedAt,
        projectName: projects.name,
      })
      .from(companyProfiles)
      .leftJoin(projects, eq(companyProfiles.projectId, projects.id))
      .where(gte(companyProfiles.updatedAt, cutoffDate))
      .orderBy(desc(companyProfiles.updatedAt))
      .limit(500);
  }
  // Newest row per slug (rows are already newest-first).
  const rowBySlug = new Map<string, CachedRow>();
  for (const r of candidateRows) if (!rowBySlug.has(r.slug)) rowBySlug.set(r.slug, r);
  const matchCandidates: MatchCandidate[] = [...rowBySlug.values()].map((r) => ({
    slug: r.slug,
    name: (r.data as { name?: string } | null)?.name ?? null,
    domain: (r.data as { domain?: string } | null)?.domain ?? null,
  }));

  for (const input of companyInputs) {
    const companyName = input.name;
    const match = forceRefresh ? null : matchCompany(companyName, input.domain, matchCandidates);

    if (match) {
      const cached = rowBySlug.get(match.slug)!;
      // Not yet confirmed by the user — report the hit and let the frontend
      // prompt. A "similar" match is always surfaced (never auto-reused) so the
      // user confirms it's the same company.
      if (!reuse) {
        const daysOld = cached.updatedAt
          ? Math.max(0, Math.floor((Date.now() - new Date(cached.updatedAt).getTime()) / 86400000))
          : null;
        existing.push({
          company_name: companyName,
          matched_name: match.name ?? cached.slug,
          slug: cached.slug,
          updated_at: cached.updatedAt,
          days_old: daysOld,
          source_project: cached.projectName ?? null,
          match_type: match.matchType,
        });
        continue;
      }
      // User chose "Use existing" — copy the cached profile to this project.
      try {
        await db
          .insert(companyProfiles)
          .values({
            jobId: cached.jobId,
            projectId,
            userId: user.id,
            slug: cached.slug,
            data: cached.data as CompanyDetail,
            totalScore: cached.totalScore,
            rating: cached.rating,
            industry: cached.industry,
            urgency: cached.urgency,
            primarySolution: cached.primarySolution,
            geminiStatus: cached.geminiStatus,
          })
          .onConflictDoUpdate({
            target: [companyProfiles.projectId, companyProfiles.slug],
            set: {
              jobId: cached.jobId,
              userId: user.id,
              data: cached.data as CompanyDetail,
              totalScore: cached.totalScore,
              rating: cached.rating,
              industry: cached.industry,
              urgency: cached.urgency,
              primarySolution: cached.primarySolution,
              geminiStatus: cached.geminiStatus,
              updatedAt: new Date(),
            },
          });

        jobs.push({ id: cached.jobId, cached: true, company_name: companyName, slug: cached.slug });
        continue;
      } catch {
        // fall through to creating a fresh job
      }
    }

    // No match — create a new research job. Carry the resolved domain (from a
    // pasted URL) as context so the profile agent pins to the RIGHT company
    // rather than a same-named one.
    const companyContext = input.domain ? { domain: input.domain } : {};
    const [job] = await db
      .insert(researchJobs)
      .values({ projectId, userId: user.id, companyName, companyContext })
      .returning();

    if (job) {
      // Create all research steps
      await db.insert(researchSteps).values(
        agentSteps.map((step) => ({
          jobId: job.id,
          agentName: step.agent_name,
          phase: step.phase,
        }))
      );

      // Trigger Inngest pipeline
      await inngest.send({
        name: "research/company.start",
        data: { jobId: job.id, companyName, ...(input.domain ? { companyContext } : {}) },
      });

      jobs.push(serializeJob(job));
    }
  }

  // Update project company count
  await db
    .update(projects)
    .set({
      companyCount: sql`${projects.companyCount} + ${jobs.length}`,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ jobs, count: jobs.length, existing });
}
