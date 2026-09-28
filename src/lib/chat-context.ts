import { db } from "@/lib/db";
import { companyProfiles, stakeholderProfiles } from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import type { CompanyDetail, DeepStakeholderProfile } from "@/lib/types";
import { canonicalName, levenshtein } from "@/lib/company-match";
import offeringsData from "@/data/offerings-kb.json";

/** Fuzzy relevance 0..1 of a search query against a candidate string.
 *  Rewards exact/substring/token-overlap, backs off to Levenshtein ratio so
 *  typos and partial names ("artera" → "Artera Services") still match. */
function fuzzyScore(query: string, target: string): number {
  const q = canonicalName(query);
  const t = canonicalName(target);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.95;
  const qTokens = q.split(" ").filter(Boolean);
  const tTokens = new Set(t.split(" ").filter(Boolean));
  const overlap = qTokens.filter((tok) => tTokens.has(tok)).length;
  if (overlap) return 0.7 + 0.25 * (overlap / qTokens.length);
  const max = Math.max(q.length, t.length);
  return max === 0 ? 0 : 1 - levenshtein(q, t) / max;
}

const BASE_PREAMBLE = `You are KYC Genie, Techolution's AI sales intelligence assistant. You help sales teams understand company research, identify opportunities, and recommend solutions from Techolution's portfolio.

RESPONSE STYLE:
- Act as a senior sales advisor, not a database. Synthesize, reason, and recommend — never dump raw data.
- Lead with the most important insight or takeaway first.
- Match depth to the question. For quick/overview questions, keep it tight (3-5 bullets). For analytical or opportunity questions ("is there an opportunity to sell X at Y", "how do we win here", "why now", "how should we approach them"), go deeper and actually reason it through — do NOT reduce these to a thin bullet list.
- Use clear structure: bold headers for sections, bullet points for lists, short sentences.
- When the user asks about a company, give an executive briefing: who they are, why they matter to us, top opportunities, and recommended next steps.
- When the user asks to compare companies, use a concise side-by-side format highlighting key differences.
- End with a clear recommendation or concrete next step when relevant.
- Use plain, professional language. Avoid jargon unless the user uses it first.

ADVISOR REASONING (use for analytical / opportunity / "can we sell X" / "how do we approach" questions):
Reason through the opportunity explicitly, connecting the dots in the research:
1. Pain point / trigger — what problem or event in the research creates the need?
2. Solution fit — which Techolution offering maps to it, and why (cite the specific fit)?
3. Why now — what makes this timely (trigger events, urgency, initiatives)?
4. Stakeholder angle — who is the buyer/champion, what do they care about, how to open the conversation?
5. Next step — the concrete recommended play.
Base every step on the retrieved research; if a step's data is missing, say so rather than inventing it.

STRICT DATA POLICY:
- Ground every answer in the research/context data provided or retrieved via your tools. Do NOT use general knowledge or training data to state facts about a company, person, score, or opportunity.
- Before saying you don't have information, you MUST call the relevant lookup or search tool (search_companies / search_stakeholders / lookup_company / lookup_stakeholder). Only respond that data is unavailable AFTER a tool has returned nothing. Never refuse without searching first.
- If, after searching and looking up, the answer is genuinely not in the data, respond with: "I don't have that information in the current research data." Do not guess, speculate, or fill in gaps.
- Never fabricate data points, statistics, scores, stakeholder names, or company details.
- When recommending solutions, only cite case studies and clients that appear in the Techolution Solutions Portfolio provided below.
- When drafting emails or messages, only use stakeholder names, pain points, and solution mappings that exist in the research data.
- You may rephrase, summarize, reorganize, and REASON OVER the provided data, but you must not add facts that are not present in it.`;

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

  // Ceiling only guards against a pathological request bloating context.
  const safeSlugs = slugs.slice(0, 25);

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

  // Ceiling only guards against a pathological request bloating context.
  const safeIds = ids.slice(0, 25);

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

/** Fuzzy server-side search over the user's researched companies. Returns a
 *  short ranked list (name + slug + brief) the model can then hand to
 *  lookup_company. Matches name / industry / primary solution / slug so entities
 *  beyond the pre-injected index — or with typo'd / partial names — are reachable. */
export async function searchCompanies(userId: string, query: string): Promise<string | null> {
  const q = (query || "").trim();
  if (!q) return null;

  const rows = await db
    .select({
      slug: companyProfiles.slug,
      total_score: companyProfiles.totalScore,
      rating: companyProfiles.rating,
      industry: companyProfiles.industry,
      primary_solution: companyProfiles.primarySolution,
      data: companyProfiles.data,
    })
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, userId));
  if (!rows.length) return null;

  const scored = rows
    .map((r) => {
      const d = (r.data || {}) as Record<string, any>;
      const name = (d.name as string) || r.slug;
      const score = Math.max(
        fuzzyScore(q, name),
        fuzzyScore(q, r.slug),
        r.industry ? fuzzyScore(q, r.industry) * 0.8 : 0,
        r.primary_solution ? fuzzyScore(q, r.primary_solution) * 0.7 : 0,
      );
      return { name, slug: r.slug, total_score: r.total_score, rating: r.rating, industry: r.industry, primary_solution: r.primary_solution, exec: typeof d.execSummary === "string" ? d.execSummary : "", score };
    })
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (!scored.length) return null;
  const lines = scored.map(
    (c) => `- **${c.name}** [slug: ${c.slug}]: Score ${c.total_score ?? "N/A"} (${c.rating ?? "N/A"}), ${c.industry ?? ""}, Primary: ${c.primary_solution ?? ""}. ${c.exec.slice(0, 200)}`,
  );
  return `Matching companies (use lookup_company with the slug for full data):\n${lines.join("\n")}`;
}

/** Fuzzy server-side search over the user's deep-analyzed stakeholders. Returns a
 *  ranked list (name + id + title/company) the model can hand to lookup_stakeholder. */
export async function searchStakeholders(userId: string, query: string): Promise<string | null> {
  const q = (query || "").trim();
  if (!q) return null;

  const rows = await db
    .select({
      id: stakeholderProfiles.id,
      name: stakeholderProfiles.name,
      company: stakeholderProfiles.company,
      title: stakeholderProfiles.title,
    })
    .from(stakeholderProfiles)
    .where(and(eq(stakeholderProfiles.userId, userId), eq(stakeholderProfiles.status, "completed")));
  if (!rows.length) return null;

  const scored = rows
    .map((r) => ({
      ...r,
      score: Math.max(
        fuzzyScore(q, r.name),
        r.company ? fuzzyScore(q, r.company) * 0.85 : 0,
        r.title ? fuzzyScore(q, r.title) * 0.6 : 0,
      ),
    }))
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (!scored.length) return null;
  const lines = scored.map(
    (s) => `- **${s.name}**${s.title ? ` — ${s.title}` : ""}${s.company ? ` @ ${s.company}` : ""} [id: ${s.id}]`,
  );
  return `Matching stakeholders (use lookup_stakeholder with the id for full profile):\n${lines.join("\n")}`;
}

export async function buildChatSystemPrompt(context: {
  type: "company" | "project" | "global";
  projectId?: string;
  companySlug?: string;
  stakeholderId?: string;
  userId?: string;
}): Promise<{ prompt: string; hasCompanyIndex: boolean; hasStakeholderIndex: boolean }> {
  const sections: string[] = [BASE_PREAMBLE, buildSolutionsSummary()];

  // Page-awareness: when the user is viewing a specific stakeholder, eager-load
  // that person's FULL profile plus their employer company's bundle so the chat
  // can answer about the page they're on without a tool round-trip.
  if (context.stakeholderId && context.userId) {
    const bundle = await fetchStakeholderBundle(context.userId, [context.stakeholderId]);
    if (bundle) {
      sections.push(`## Stakeholder You Are Viewing\n\n${bundle}`);
    }
    // Pull the employer company's bundle too, if this person is linked to one.
    const [stk] = await db
      .select({ companyProfileId: stakeholderProfiles.companyProfileId })
      .from(stakeholderProfiles)
      .where(and(eq(stakeholderProfiles.id, context.stakeholderId), eq(stakeholderProfiles.userId, context.userId)))
      .limit(1);
    if (stk?.companyProfileId) {
      const [co] = await db
        .select({ slug: companyProfiles.slug })
        .from(companyProfiles)
        .where(eq(companyProfiles.id, stk.companyProfileId))
        .limit(1);
      if (co?.slug) {
        const coBundle = await fetchCompanySalesBundle(context.userId, [co.slug]);
        if (coBundle) sections.push(`## Employer Company Research\n\n${coBundle}`);
      }
    }
  }

  if (context.type === "company" && context.companySlug && context.projectId) {
    // Use the same clean markdown bundle the lookup tool produces (not a raw
    // JSON dump) so the model reasons over dense, readable research.
    let coBundle: string | null = null;
    if (context.userId) {
      coBundle = await fetchCompanySalesBundle(context.userId, [context.companySlug]);
    }
    if (coBundle) {
      sections.push(`## Company Research Data\n\n${coBundle}`);
    } else {
      // Fallback: company not matched by userId+slug — read by project+slug.
      const [profile] = await db
        .select({ data: companyProfiles.data })
        .from(companyProfiles)
        .where(and(eq(companyProfiles.projectId, context.projectId), eq(companyProfiles.slug, context.companySlug)))
        .limit(1);
      if (profile?.data) {
        const company = cleanCompanyData(profile.data as CompanyDetail);
        sections.push(`## Company Research Data\n\n${JSON.stringify(company, null, 2)}`);
      }
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
      .limit(200);

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
        `- **${p.name}** [slug: ${p.slug}]: Score ${p.total_score} (${p.rating}), ${p.industry}, Primary: ${p.primary_solution}. ${p.execSummary.slice(0, 300)}`
      ).join("\n");
      sections.push(`## Your Researched Companies\n\n${index}`);
      sections.push(`COMPANY RESEARCH ACCESS:\nYou have a lookup_company tool to retrieve full sales intelligence bundles for any of the researched companies listed above, and a search_companies tool to find a company by name/industry/solution when it is not obvious in the list above (handles typos and partial names). ALWAYS use these tools when the user asks about a specific company, needs comparisons, stakeholder info, pain points, solution fit, or any company-specific intelligence. If a company name in the question isn't an obvious match above, call search_companies first to resolve it, then lookup_company. Do not answer company-specific questions from the summary list alone — the summaries are too brief.`);
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
      .limit(200);

    if (stakeholders.length) {
      hasStakeholderIndex = true;
      const index = stakeholders
        .map((s) => `- **${s.name}**${s.title ? ` — ${s.title}` : ""}${s.company ? ` @ ${s.company}` : ""} [id: ${s.id}]`)
        .join("\n");
      sections.push(`## Deep-Analyzed Stakeholders\n\n${index}`);
      sections.push(`STAKEHOLDER INTELLIGENCE ACCESS:\nYou have a lookup_stakeholder tool to retrieve the full deep-analysis profile for any of the people listed above (their LinkedIn experience, priorities, pain points, recommended engagement approach, and post insights), and a search_stakeholders tool to find a person by name/company/title when they aren't obvious in the list (handles typos and partial names). Use these whenever the user asks about a specific person, wants help drafting outreach to them, or needs to understand how to approach or sell to them. If the name isn't an obvious match above, call search_stakeholders first, then lookup_stakeholder with the id. Do not answer person-specific questions from the summary list alone — get the complete profile first, then synthesize.`);
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
