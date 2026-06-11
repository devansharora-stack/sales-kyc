import { db } from "@/lib/db";
import { companyProfiles, stakeholderProfiles } from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import type { CompanyDetail, DeepStakeholderProfile } from "@/lib/types";
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

export async function fetchCompanySalesBundle(
  userId: string,
  slugs: string[]
): Promise<string | null> {
  if (!slugs.length) return null;

  const safeSlugs = slugs.slice(0, 3);

  const rows = await db
    .select({ slug: companyProfiles.slug, data: companyProfiles.data })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.userId, userId), inArray(companyProfiles.slug, safeSlugs)));

  if (!rows.length) return null;

  // The bundle fields all live in the `data` JSONB blob; flatten for access.
  const profiles: Record<string, any>[] = rows.map((r) => ({
    slug: r.slug,
    ...((r.data || {}) as Record<string, any>),
  }));

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

export async function fetchStakeholderBundle(
  userId: string,
  ids: string[]
): Promise<string | null> {
  if (!ids.length) return null;

  const safeIds = ids.slice(0, 3);

  const rows = await db
    .select({
      id: stakeholderProfiles.id,
      name: stakeholderProfiles.name,
      company: stakeholderProfiles.company,
      title: stakeholderProfiles.title,
      data: stakeholderProfiles.data,
    })
    .from(stakeholderProfiles)
    .where(and(eq(stakeholderProfiles.userId, userId), inArray(stakeholderProfiles.id, safeIds)));

  if (!rows.length) return null;

  const sections: string[] = [];

  for (const row of rows) {
    const profile = (row.data as { profile?: DeepStakeholderProfile } | null)?.profile;
    if (!profile) continue;

    const b = profile.intelBrief;
    const lines: string[] = [];
    lines.push(`## Deep Stakeholder Profile: ${profile.fullName || row.name}`);
    lines.push(
      `**Role:** ${profile.headline || row.title || ""}${row.company ? ` @ ${row.company}` : ""} | **Location:** ${profile.location || "N/A"}`
    );
    if (profile.linkedinUrl) lines.push(`**LinkedIn:** ${profile.linkedinUrl}`);
    if (b?.intelQuality) lines.push(`**Intel Quality:** ${b.intelQuality}${b.intelQualityReason ? ` — ${b.intelQualityReason}` : ""}`);

    if (b?.executiveSummary) lines.push(`\n### Executive Summary\n${b.executiveSummary}`);
    if (b?.keyInsight) lines.push(`\n### Key Insight\n${b.keyInsight}`);

    if (b?.verifiedPriorities?.length) {
      lines.push(`\n### Verified Priorities`);
      for (const p of b.verifiedPriorities) {
        lines.push(`- **${p.priority}** [${p.confidence}]: ${p.evidence}${p.sourceUrl ? ` (${p.sourceUrl})` : ""}`);
      }
    }

    if (b?.painPoints?.length) {
      lines.push(`\n### Pain Points`);
      for (const p of b.painPoints) {
        lines.push(`- **${p.pain}** [${p.confidence}]: ${p.evidence}${p.sourceUrl ? ` (${p.sourceUrl})` : ""}`);
      }
    }

    if (b?.engagementApproach) {
      const e = b.engagementApproach;
      lines.push(`\n### Engagement Approach`);
      if (e.openingAngle) lines.push(`**Opening Angle:** ${e.openingAngle}`);
      if (e.talkingPoints?.length) lines.push(`**Talking Points:** ${e.talkingPoints.join("; ")}`);
      if (e.avoidTopics?.length) lines.push(`**Avoid:** ${e.avoidTopics.join("; ")}`);
    }

    if (b?.postInsights?.length) {
      lines.push(`\n### LinkedIn Post Insights`);
      for (const pi of b.postInsights) {
        lines.push(`- **${pi.headline}:** ${pi.insight}${pi.engagement ? ` (${pi.engagement})` : ""}${pi.sourceUrl ? ` — ${pi.sourceUrl}` : ""}`);
      }
    }

    if (profile.experience?.length) {
      lines.push(`\n### Experience`);
      for (const ex of profile.experience.slice(0, 5)) {
        lines.push(`- **${ex.position || ""}** at ${ex.company || ""}${ex.duration ? ` (${ex.duration})` : ""}`);
      }
    }

    if (profile.skills?.length) lines.push(`\n### Skills\n${profile.skills.slice(0, 20).join(", ")}`);

    sections.push(lines.join("\n"));
  }

  if (!sections.length) return null;
  return sections.join("\n\n---\n\n");
}

export async function buildChatSystemPrompt(context: {
  type: "company" | "project" | "global";
  projectId?: string;
  companySlug?: string;
  userId?: string;
}): Promise<{ prompt: string; hasCompanyIndex: boolean; hasStakeholderIndex: boolean }> {
  const sections: string[] = [BASE_PREAMBLE, buildSolutionsSummary()];

  if (context.type === "company" && context.companySlug && context.projectId) {
    const [profile] = await db
      .select({ data: companyProfiles.data })
      .from(companyProfiles)
      .where(and(eq(companyProfiles.projectId, context.projectId), eq(companyProfiles.slug, context.companySlug)))
      .limit(1);

    if (profile?.data) {
      const company = cleanCompanyData(profile.data as CompanyDetail);
      sections.push(`## Company Research Data\n\n${JSON.stringify(company, null, 2)}`);
    }
  } else if (context.type === "project" && context.projectId) {
    const rows = await db
      .select({
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
      .where(eq(companyProfiles.projectId, context.projectId))
      .orderBy(desc(companyProfiles.totalScore));

    if (rows.length) {
      const profiles = rows.map((r) => {
        const d = (r.data || {}) as Record<string, any>;
        return {
          slug: r.slug,
          total_score: r.total_score,
          rating: r.rating,
          industry: r.industry,
          urgency: r.urgency,
          primary_solution: r.primary_solution,
          gemini_status: r.gemini_status,
          name: d.name,
          fullName: d.fullName,
          hqCity: d.hqCity,
          state: d.state,
          execSummary: d.execSummary,
        };
      });
      sections.push(`## Project Companies (${profiles.length} researched)\n\n${JSON.stringify(profiles, null, 2)}`);
    }
  }

  let companyIndex: CompanyIndex[] = [];
  let hasCompanyIndex = false;

  if (context.userId) {
    const allProfiles = await db
      .select({
        slug: companyProfiles.slug,
        total_score: companyProfiles.totalScore,
        rating: companyProfiles.rating,
        industry: companyProfiles.industry,
        primary_solution: companyProfiles.primarySolution,
        data: companyProfiles.data,
      })
      .from(companyProfiles)
      .where(eq(companyProfiles.userId, context.userId))
      .orderBy(desc(companyProfiles.totalScore))
      .limit(30);

    if (allProfiles.length) {
      hasCompanyIndex = true;
      companyIndex = allProfiles.map((p) => {
        const d = (p.data || {}) as Record<string, any>;
        return {
          slug: p.slug,
          name: (d.name as string) ?? "",
          total_score: (p.total_score as number) ?? 0,
          rating: p.rating as string,
          industry: p.industry as string,
          primary_solution: p.primary_solution as string,
          execSummary: typeof d.execSummary === "string" ? d.execSummary : "",
        };
      });

      const index = companyIndex.map((p) =>
        `- **${p.name}** [slug: ${p.slug}]: Score ${p.total_score} (${p.rating}), ${p.industry}, Primary: ${p.primary_solution}. ${p.execSummary.slice(0, 120)}`
      ).join("\n");
      sections.push(`## Your Researched Companies\n\n${index}`);
      sections.push(`COMPANY RESEARCH ACCESS:\nYou have a lookup_company tool to retrieve full sales intelligence bundles for any of the researched companies listed above. ALWAYS use this tool when the user asks about a specific company, needs comparisons, stakeholder info, pain points, solution fit, or any company-specific intelligence. Do not answer company-specific questions from the summary list alone — the summaries are too brief. Use the tool to get the complete data first, then synthesize your answer from it.`);
    }
  }

  let hasStakeholderIndex = false;

  if (context.userId) {
    const stakeholders = await db
      .select({
        id: stakeholderProfiles.id,
        name: stakeholderProfiles.name,
        company: stakeholderProfiles.company,
        title: stakeholderProfiles.title,
      })
      .from(stakeholderProfiles)
      .where(and(eq(stakeholderProfiles.userId, context.userId), eq(stakeholderProfiles.status, "completed")))
      .orderBy(desc(stakeholderProfiles.updatedAt))
      .limit(30);

    if (stakeholders.length) {
      hasStakeholderIndex = true;
      const index = stakeholders
        .map((s) => `- **${s.name}**${s.title ? ` — ${s.title}` : ""}${s.company ? ` @ ${s.company}` : ""} [id: ${s.id}]`)
        .join("\n");
      sections.push(`## Deep-Analyzed Stakeholders\n\n${index}`);
      sections.push(`STAKEHOLDER INTELLIGENCE ACCESS:\nYou have a lookup_stakeholder tool to retrieve the full deep-analysis profile for any of the people listed above (their LinkedIn experience, priorities, pain points, recommended engagement approach, and post insights). Use this tool whenever the user asks about a specific person, wants help drafting outreach to them, or needs to understand how to approach or sell to them. Pass the id values from the list above. Do not answer person-specific questions from the summary list alone — use the tool to get the complete profile first, then synthesize.`);
    }
  }

  return { prompt: sections.join("\n\n"), hasCompanyIndex, hasStakeholderIndex };
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
