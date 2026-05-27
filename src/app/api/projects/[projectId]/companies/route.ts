import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createServerClient } from "@/lib/db";
import { inngest } from "@/lib/inngest";

/**
 * Extract company name from a URL by fetching the page title.
 * Falls back to domain name if fetch fails.
 */
async function extractCompanyFromUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const domain = parsed.hostname.replace(/^www\./, "");

    // Try fetching the page to get the title
    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KYCGenie/1.0)" },
    });

    if (res.ok) {
      const html = await res.text();
      // Extract <title> tag
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        let title = titleMatch[1].trim();
        // Decode HTML entities
        title = title.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
        title = title.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
        title = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        // Clean common suffixes: "Company Name | Official Site", "Company - Home"
        title = title.split(/\s*[|\-–—:]\s*/)[0].trim();
        // Remove trademark symbols
        title = title.replace(/[®™©]/g, "").trim();
        if (title.length >= 2 && title.length <= 100) {
          return title;
        }
      }
    }

    // Fallback: use domain name, capitalize it
    const name = domain.split(".")[0];
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
  const supabase = createServerClient();

  // Verify project belongs to this user
  const { data: userRecord } = await supabase
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();
  if (userRecord) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userRecord.id)
      .single();
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  // If slug is provided, return full profile data for a single company
  if (slug) {
    const { data: profile } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("project_id", projectId)
      .eq("slug", slug)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({
      profiles: [profile],
      jobs: [],
    });
  }

  // Get completed company profiles (summary view for list)
  const { data: profiles } = await supabase
    .from("company_profiles")
    .select("id, slug, total_score, rating, industry, urgency, primary_solution, gemini_status, data->name, data->fullName, data->hqCity, data->state, data->execSummary")
    .eq("project_id", projectId)
    .order("total_score", { ascending: false });

  // Get active research jobs
  const { data: jobs } = await supabase
    .from("research_jobs")
    .select("*, research_steps(*)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    profiles: profiles || [],
    jobs: jobs || [],
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
  const supabase = createServerClient();
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
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();

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
    { agent_name: "solution_mapper", phase: 3 },
    { agent_name: "gtm_generator", phase: 3 },
    { agent_name: "scoring_agent", phase: 3 },
    { agent_name: "verification", phase: 4 },
  ];

  const CACHE_MAX_AGE_DAYS = 7;
  const forceRefresh = body.forceRefresh === true;

  const jobs = [];
  for (const companyName of companyNames) {
    // Normalize slug for cache lookup
    const normalizedSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // Check for existing cached profile (any project, within 7 days)
    if (!forceRefresh) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_AGE_DAYS);

      const { data: cached } = await supabase
        .from("company_profiles")
        .select("*")
        .eq("slug", normalizedSlug)
        .gte("updated_at", cutoffDate.toISOString())
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        // Copy cached profile to this project
        const { error: upsertError } = await supabase.from("company_profiles").upsert(
          {
            job_id: cached.job_id,
            project_id: projectId,
            user_id: user.id,
            slug: cached.slug,
            data: cached.data,
            total_score: cached.total_score,
            rating: cached.rating,
            industry: cached.industry,
            urgency: cached.urgency,
            primary_solution: cached.primary_solution,
            gemini_status: cached.gemini_status,
          },
          { onConflict: "project_id,slug" }
        );

        if (!upsertError) {
          jobs.push({ id: cached.job_id, cached: true, company_name: companyName, slug: cached.slug });
          continue;
        }
      }
    }

    // No cache hit — create a new research job
    const { data: job } = await supabase
      .from("research_jobs")
      .insert({
        project_id: projectId,
        user_id: user.id,
        company_name: companyName,
      })
      .select()
      .single();

    if (job) {
      // Create all research steps
      await supabase.from("research_steps").insert(
        agentSteps.map((step) => ({
          job_id: job.id,
          agent_name: step.agent_name,
          phase: step.phase,
        }))
      );

      // Trigger Inngest pipeline
      await inngest.send({
        name: "research/company.start",
        data: { jobId: job.id, companyName },
      });

      jobs.push(job);
    }
  }

  // Update project company count
  const { data: currentProject } = await supabase
    .from("projects")
    .select("company_count")
    .eq("id", projectId)
    .single();

  await supabase
    .from("projects")
    .update({
      company_count: (currentProject?.company_count || 0) + jobs.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  return NextResponse.json({ jobs, count: jobs.length });
}
