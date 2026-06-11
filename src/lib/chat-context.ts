import { createServerClient } from "@/lib/db";
import type { CompanyDetail } from "@/lib/types";
import offeringsData from "@/data/offerings-kb.json";

const BASE_PREAMBLE = `You are KYC Genie, Techolution's AI sales intelligence assistant. You help sales teams understand company research, identify opportunities, and recommend solutions from Techolution's portfolio.

RESPONSE STYLE:
- Act as a senior sales analyst, not a database. Synthesize and summarize — never dump raw data.
- Lead with the most important insight or takeaway first.
- Keep responses concise: aim for 3-5 key bullet points for overview questions. Use short paragraphs, not walls of text.
- Use clear structure: bold headers for sections, bullet points for lists, short sentences.
- Cover all relevant dimensions (score, pain points, solutions, stakeholders, triggers) but summarize each in 1-2 lines unless the user asks to go deeper.
- When the user asks about a company, give an executive briefing: who they are, why they matter to us, top opportunities, and recommended next steps.
- When the user asks to compare companies, use a concise side-by-side format highlighting key differences.
- Only go into full detail on a specific topic (e.g. all stakeholders, full score breakdown) when the user explicitly asks for it.
- End with a clear recommendation or suggested next step when relevant.
- Use plain, professional language. Avoid jargon unless the user uses it first.

STRICT DATA POLICY:
- You must ONLY use information provided in the context below. Do NOT use your own training data or general knowledge to answer questions.
- If the answer is not contained in the provided context data, respond with: "I don't have that information in the current research data." Do not guess, speculate, or fill in gaps.
- If a user asks about a company, project, or topic that does not exist in the provided data, say: "That information is not available on the platform."
- Never fabricate data points, statistics, scores, stakeholder names, or company details.
- When recommending solutions, only cite case studies and clients that appear in the Techolution Solutions Portfolio provided below.
- When drafting emails or messages, only use stakeholder names, pain points, and solution mappings that exist in the research data.
- You may rephrase, summarize, or reorganize the provided data, but you must not add information that is not present in it.`;

let cachedSolutionsSummary: string | null = null;

function buildSolutionsSummary(): string {
  if (cachedSolutionsSummary) return cachedSolutionsSummary;

  const lines: string[] = ["## Techolution Solutions Portfolio"];
  let currentCategory = "";

  for (const o of offeringsData.offerings) {
    if (o.category !== currentCategory) {
      currentCategory = o.category;
      lines.push(`\n### ${currentCategory}`);
    }

    const name = o.subType ? `${o.subType}` : o.category;
    const desc = o.description.split("\n")[0];
    const price = o.startingPrice ? ` ${o.startingPrice}.` : "";
    const entry = o.entryPoint ? " Entry point." : "";
    const clients = o.caseStudies.length > 0
      ? ` Clients: ${o.caseStudies.map((c) => c.client).join(", ")}.`
      : "";

    lines.push(`- **${name}**: ${desc}${price}${entry}${clients}`);
  }

  cachedSolutionsSummary = lines.join("\n");
  return cachedSolutionsSummary;
}

interface CompanyIndex {
  slug: string;
  name: string;
  total_score: number;
  rating: string;
  industry: string;
  primary_solution: string;
  execSummary: string;
}

const SALES_BUNDLE_FIELDS = [
  "data->name",
  "data->fullName",
  "data->industry",
  "data->subSector",
  "data->hqCity",
  "data->state",
  "data->totalScore",
  "data->rating",
  "data->execSummary",
  "data->businessDescription",
  "data->stakeholders",
  "data->painPoints",
  "data->gtm",
  "data->solutionMappings",
  "data->triggerEvents",
  "data->scores",
  "data->salesIntelligence",
].join(", ");

export async function fetchCompanySalesBundle(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  slugs: string[]
): Promise<string | null> {
  if (!slugs.length) return null;

  const safeSlugs = slugs.slice(0, 3);

  const { data: profiles } = await supabase
    .from("company_profiles")
    .select(`slug, ${SALES_BUNDLE_FIELDS}`)
    .eq("user_id", userId)
    .in("slug", safeSlugs) as { data: Record<string, unknown>[] | null };

  if (!profiles || profiles.length === 0) return null;

  const sections: string[] = [];

  for (const p of profiles) {
    const lines: string[] = [];
    const name = p.name || p.slug;
    lines.push(`## Sales Intelligence Bundle: ${name}`);
    lines.push(`**Company:** ${p.fullName || name} | ${p.industry || ""} ${p.subSector ? `/ ${p.subSector}` : ""} | ${p.hqCity || ""}, ${p.state || ""}`);
    lines.push(`**Score:** ${p.totalScore}/100 (${p.rating})`);

    if (p.execSummary) {
      lines.push(`\n### Executive Summary\n${p.execSummary}`);
    }

    if (p.businessDescription) {
      lines.push(`\n### Business Overview\n${p.businessDescription}`);
    }

    if (p.scores && typeof p.scores === "object") {
      lines.push(`\n### Score Breakdown`);
      for (const [key, dim] of Object.entries(p.scores)) {
        const d = dim as { points?: number; reasoning?: string };
        if (d?.points != null) {
          lines.push(`- **${key}:** ${d.points} pts${d.reasoning ? ` — ${d.reasoning}` : ""}`);
        }
      }
    }

    if (Array.isArray(p.stakeholders) && p.stakeholders.length > 0) {
      lines.push(`\n### Key Stakeholders (${p.stakeholders.length})`);
      for (const s of p.stakeholders) {
        const conf = s.confidence ? ` [${s.confidence}]` : "";
        lines.push(`- **${s.name}** — ${s.title} (${s.tier})${conf}: ${s.relevance || ""}`);
      }
    }

    if (Array.isArray(p.painPoints) && p.painPoints.length > 0) {
      lines.push(`\n### Pain Points (${p.painPoints.length})`);
      for (const pp of p.painPoints) {
        const solutions = Array.isArray(pp.techolutionSolutions) && pp.techolutionSolutions.length > 0
          ? ` → Solutions: ${pp.techolutionSolutions.join(", ")}`
          : "";
        lines.push(`- **[${pp.severity}] ${pp.title}:** ${pp.description || ""}${solutions}`);
      }
    }

    if (p.gtm && typeof p.gtm === "object") {
      const g = p.gtm as Record<string, unknown>;
      lines.push(`\n### GTM Strategy`);
      if (g.brief) lines.push(`**Brief:** ${g.brief}`);
      if (g.entrySolution) lines.push(`**Entry Solution:** ${g.entrySolution}`);
      if (g.urgency) lines.push(`**Urgency:** ${g.urgency}${g.urgencyReasoning ? ` — ${g.urgencyReasoning}` : ""}`);
      if (g.expandPath) lines.push(`**Expansion Path:** ${g.expandPath}`);
      if (g.competitivePositioning) lines.push(`**Competitive Positioning:** ${g.competitivePositioning}`);
      if (Array.isArray(g.entryStrategy)) {
        lines.push(`**Entry Strategy:**`);
        (g.entryStrategy as string[]).forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
      }
      if (g.pilotStrategy && typeof g.pilotStrategy === "object") {
        const ps = g.pilotStrategy as Record<string, unknown>;
        lines.push(`**Pilot:** ${ps.title || ""} | Scope: ${ps.scope || ""} | Duration: ${ps.duration || ""} | Budget: ${ps.estimatedBudget || ""}`);
      }
    }

    if (Array.isArray(p.solutionMappings) && p.solutionMappings.length > 0) {
      lines.push(`\n### Solution Mapping (${p.solutionMappings.length})`);
      for (const m of p.solutionMappings) {
        const score = m.fitScore != null ? ` (Fit: ${m.fitScore}/100)` : "";
        lines.push(`- **${m.solutionName}**${score}: ${m.painPoint} → ${m.value}`);
        if (m.reasoning) lines.push(`  Reasoning: ${m.reasoning}`);
      }
    }

    if (Array.isArray(p.triggerEvents) && p.triggerEvents.length > 0) {
      lines.push(`\n### Trigger Events (${p.triggerEvents.length})`);
      for (const t of p.triggerEvents) {
        lines.push(`- **[${t.category}] ${t.event}** (${t.date}): ${t.detail || ""} | Impact: ${t.impact || ""}`);
      }
    }

    if (p.salesIntelligence && typeof p.salesIntelligence === "object") {
      const si = p.salesIntelligence as Record<string, unknown>;
      lines.push(`\n### Sales Intelligence`);
      if (si.opportunityValue && typeof si.opportunityValue === "object") {
        const ov = si.opportunityValue as Record<string, unknown>;
        lines.push(`**Opportunity Value:** ${ov.score}/10 | First Year: ${ov.estimatedFirstYear || "N/A"} | Expansion: ${ov.estimatedExpansion || "N/A"}`);
      }
      if (si.salesMotion && typeof si.salesMotion === "object") {
        const sm = si.salesMotion as Record<string, unknown>;
        lines.push(`**Sales Motion:** ${sm.motion} (${sm.score}/10) | Cycle: ${sm.cycleLength || "N/A"} | Build vs Buy Risk: ${sm.buildVsBuyRisk || "N/A"}`);
      }
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n---\n\n");
}

export async function buildChatSystemPrompt(context: {
  type: "company" | "project" | "global";
  projectId?: string;
  companySlug?: string;
  userId?: string;
}): Promise<{ prompt: string; hasCompanyIndex: boolean }> {
  const sections: string[] = [BASE_PREAMBLE, buildSolutionsSummary()];

  const supabase = createServerClient();

  if (context.type === "company" && context.companySlug && context.projectId) {
    const { data: profile } = await supabase
      .from("company_profiles")
      .select("data")
      .eq("project_id", context.projectId)
      .eq("slug", context.companySlug)
      .single();

    if (profile?.data) {
      const company = cleanCompanyData(profile.data as CompanyDetail);
      sections.push(`## Company Research Data\n\n${JSON.stringify(company, null, 2)}`);
    }
  } else if (context.type === "project" && context.projectId) {
    const { data: profiles } = await supabase
      .from("company_profiles")
      .select("slug, total_score, rating, industry, urgency, primary_solution, gemini_status, data->name, data->fullName, data->hqCity, data->state, data->execSummary")
      .eq("project_id", context.projectId)
      .order("total_score", { ascending: false });

    if (profiles?.length) {
      sections.push(`## Project Companies (${profiles.length} researched)\n\n${JSON.stringify(profiles, null, 2)}`);
    }
  }

  let companyIndex: CompanyIndex[] = [];
  let hasCompanyIndex = false;

  if (context.userId) {
    const { data: allProfiles } = await supabase
      .from("company_profiles")
      .select("slug, total_score, rating, industry, primary_solution, data->name, data->execSummary")
      .eq("user_id", context.userId)
      .order("total_score", { ascending: false })
      .limit(30);

    if (allProfiles?.length) {
      hasCompanyIndex = true;
      companyIndex = allProfiles.map((p: Record<string, unknown>) => ({
        slug: p.slug as string,
        name: p.name as string,
        total_score: p.total_score as number,
        rating: p.rating as string,
        industry: p.industry as string,
        primary_solution: p.primary_solution as string,
        execSummary: typeof p.execSummary === "string" ? p.execSummary : "",
      }));

      const index = companyIndex.map((p) =>
        `- **${p.name}** [slug: ${p.slug}]: Score ${p.total_score} (${p.rating}), ${p.industry}, Primary: ${p.primary_solution}. ${p.execSummary.slice(0, 120)}`
      ).join("\n");
      sections.push(`## Your Researched Companies\n\n${index}`);
      sections.push(`COMPANY RESEARCH ACCESS:\nYou have a lookup_company tool to retrieve full sales intelligence bundles for any of the researched companies listed above. ALWAYS use this tool when the user asks about a specific company, needs comparisons, stakeholder info, pain points, solution fit, or any company-specific intelligence. Do not answer company-specific questions from the summary list alone — the summaries are too brief. Use the tool to get the complete data first, then synthesize your answer from it.`);
    }
  }

  return { prompt: sections.join("\n\n"), hasCompanyIndex };
}

function cleanCompanyData(data: CompanyDetail): Partial<CompanyDetail> {
  const {
    slug: _slug,
    generatedDate: _generatedDate,
    lastUpdated: _lastUpdated,
    relatedCompanies: _relatedCompanies,
    sources: _topLevelSources,
    ...clean
  } = data;

  if (clean.solutionMappings) {
    clean.solutionMappings = clean.solutionMappings.map((m) => {
      const { solution: _id, fitScoreBreakdown: _breakdown, ...rest } = m;
      return rest as typeof m;
    });
  }

  return clean;
}
