import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, researchJobs, researchSteps, companyProfiles } from "@/db/schema";
import { and, eq, gte, desc, inArray, sql } from "drizzle-orm";
import { serializeJob } from "@/lib/serializers";
import { inngest } from "@/lib/inngest";
import type { CompanyDetail } from "@/lib/types";

/**
 * Extract company name from a URL by fetching the page title.
 * Falls back to domain name if fetch fails.
 */
async function extractCompanyFromUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const domain = parsed.hostname.replace(/^www\./, "");
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
          return name;
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
          if (domainMatch && domainMatch.length >= 2 && domainMatch.length <= 100) return domainMatch;

          // Otherwise, the company name is usually the shortest part (taglines are longer)
          const sorted = [...parts].sort((a, b) => a.length - b.length);
          const shortest = sorted[0];
          if (shortest.length >= 2 && shortest.length <= 100) return shortest;
        }

        // Single-part title — check if it looks like a tagline (4+ words, all lowercase style)
        const wordCount = parts[0]?.split(/\s+/).length || 0;
        if (wordCount <= 4 && parts[0].length >= 2 && parts[0].length <= 100) {
          return parts[0];
        }
      }
    }

    // Fallback: capitalize domain name (e.g., "nexteraenergy" → "Nexteraenergy")
    // Try to split camelCase or known patterns
    const name = domainBase.replace(/([a-z])([A-Z])/g, "$1 $2");
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // Last resort: clean the URL into something usable
    const cleaned = url.replace(/^https?:\/\/(www\.)?/, "").split(/[./]/)[0];
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

  // Verify project belongs to this user
  const [userRecord] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email));
  if (userRecord) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userRecord.id)));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  // If slug is provided, return full profile data for a single company
  if (slug) {
    const [profile] = await db
      .select()
      .from(companyProfiles)
      .where(and(eq(companyProfiles.projectId, projectId), eq(companyProfiles.slug, slug)));

    if (!profile) {
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

  // Validate, sanitize, and resolve URLs to company names
  const validInputs: string[] = rawCompanies
    .filter((c: unknown): c is string => typeof c === "string")
    .map((c: string) => c.trim())
    .filter((c: string) => c.length > 0 && c.length <= 500);

  // Resolve any URLs to company names
  const companyNames: string[] = [];
  for (const input of validInputs) {
    if (looksLikeUrl(input)) {
      const name = await extractCompanyFromUrl(input);
      console.log(`[companies] Resolved URL "${input}" → "${name}"`);
      companyNames.push(name);
    } else {
      companyNames.push(input);
    }
  }

  if (companyNames.length === 0) {
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
    slug: string;
    updated_at: Date | null;
    days_old: number | null;
    source_project: string | null;
  }[] = [];
  for (const companyName of companyNames) {
    // Normalize slug for cache lookup
    const normalizedSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Check for existing cached profile (any project, within 7 days)
    if (!forceRefresh) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_AGE_DAYS);

      const [cached] = await db
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
        .where(and(eq(companyProfiles.slug, normalizedSlug), gte(companyProfiles.updatedAt, cutoffDate)))
        .orderBy(desc(companyProfiles.updatedAt))
        .limit(1);

      if (cached) {
        // Not yet confirmed by the user — report the hit and let the
        // frontend prompt "already researched N days ago, refresh?".
        if (!reuse) {
          const daysOld = cached.updatedAt
            ? Math.max(0, Math.floor((Date.now() - new Date(cached.updatedAt).getTime()) / 86400000))
            : null;
          existing.push({
            company_name: companyName,
            slug: cached.slug,
            updated_at: cached.updatedAt,
            days_old: daysOld,
            source_project: cached.projectName ?? null,
          });
          continue;
        }
        // User chose "Use existing" — copy the cached profile to this project
        try {
          await db
            .insert(companyProfiles)
            .values({
              jobId: cached.jobId,
              projectId,
              userId: user.id,
              slug: cached.slug,
              data: cached.data,
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
                data: cached.data,
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
    }

    // No cache hit — create a new research job
    const [job] = await db
      .insert(researchJobs)
      .values({ projectId, userId: user.id, companyName })
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
        data: { jobId: job.id, companyName },
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
