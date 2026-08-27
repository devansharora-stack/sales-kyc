/**
 * Value Finder copy generator.
 *
 * Rewrites a company's pain points + mapped solutions into second-person,
 * client-facing lead-magnet copy — addressed directly to a leader AT the
 * company ("you / your"), no third-person company writeup, no Techolution
 * product names. Used by the client-facing one-pager.
 *
 * Result is cached on companyProfiles.data.valueFinderCopy so it's generated
 * once per company, not per view.
 */

import { callClaudeJSON } from "@/lib/claude";
import type { CompanyDetail, EstimatedImpact, ValueFinderCopy } from "@/lib/types";
import { BENCHMARK_CATEGORIES, isBenchmarkCategory } from "@/lib/value-finder-benchmarks";

// Full report shows every pain point (up to this safety cap).
const MAX_PAINS = 12;

function mappingFor(company: CompanyDetail, painTitle: string) {
  const t = painTitle.toLowerCase();
  return (company.solutionMappings || []).find(
    (x) => x.painPoint?.toLowerCase().includes(t) || t.includes((x.painPoint || "").toLowerCase())
  );
}

function impactSummary(company: CompanyDetail, painTitle: string): string {
  const m = mappingFor(company, painTitle);
  if (!m) return "";
  const ei = m.estimatedImpact as string | EstimatedImpact | undefined;
  const impact = !ei ? "" : typeof ei === "string" ? ei : ei.summary;
  return [m.value, impact].filter(Boolean).join(" — ");
}

const SYSTEM_PROMPT = `You write client-facing sales one-pagers for Techolution, an enterprise AI & automation firm.
You are writing directly TO a senior leader at the target company — a warm, confident outreach, second person ("you", "your").

Rules:
- SECOND PERSON only. Never describe the company in third person ("Acme is a publicly traded…"). Address the reader: "You're scaling…", "Your compliance team…".
- No fluff, no hype adjectives, no "in today's fast-paced world".
- Each pain is matched to a named Techolution offering (the "offering" field). The offering NAME is displayed separately as a bold lead, so do NOT write the offering name inside "solution" — start the solution with what it DOES (a verb).
- Keep it concrete and grounded in the facts given.
- The "problem" must give real CONTEXT: what is happening AND why it hurts (the risk / cost of doing nothing) — not a bare restatement of a press-release fact.
- The "solution" must describe what THIS offering concretely does to fix THIS problem — the fix mechanism, not a restatement of the problem.
- PLAIN ENGLISH, 8th-grade reading level. Short sentences (aim <= 14 words each). Everyday words, not corporate jargon. Prefer verbs over noun-phrases. Examples: "country-specific" not "jurisdiction-specific"; "sign-offs" not "attestations"; "rules" not "regulatory attestations"; "match people to work" not "workforce allocation". One idea per sentence. No semicolons.
- CRITICAL — NEVER invent numbers. A number may ONLY appear in "metric" and ONLY if it is copied verbatim from the provided description/sources. If no hard number is present in the facts, "metric" and "metricSource" MUST be empty strings. Do NOT put any percentage or projected figure in "problem" or "solution".
- Return ONLY valid JSON, no prose.`;

interface CopyInput {
  title: string;
  description: string;
  offering: string; // mapped Techolution offering name (rendered as a bold lead)
  solutionAndImpact: string;
  sources: string[];
}

export async function generateValueFinderCopy(company: CompanyDetail): Promise<ValueFinderCopy> {
  const pains = (company.painPoints || []).slice(0, MAX_PAINS);
  if (pains.length === 0) return { pains: [] };

  const input: CopyInput[] = pains.map((p) => ({
    title: p.title,
    description: p.description,
    offering: mappingFor(company, p.title)?.solutionName?.trim() || "",
    solutionAndImpact: impactSummary(company, p.title),
    sources: (p.sources || []).map((s) => s.label),
  }));

  const userPrompt = `Company (the reader works here): ${company.name}
Industry: ${company.industry}${company.subSector ? " · " + company.subSector : ""}

Rewrite each of the following pain points into second-person client-facing copy.

For each item return an object with:
- "title": a short punchy pain headline (<= 70 chars). Keep it neutral, not accusatory.
- "problem": EXACTLY TWO short second-person sentences in plain English (each <= 14 words, 8th-grade level). Sentence 1 = what is happening (the situation). Sentence 2 = why it hurts — the real operational or money risk of ignoring it. <= 160 chars total. Start with "You" / "Your" where natural. Everyday words, no jargon, no numbers/percentages.
- "solution": EXACTLY TWO short second-person sentences in plain English (each <= 14 words, 8th-grade level) describing what THIS item's "offering" does. Sentence 1 = what the offering does to fix the problem, starting with a verb (e.g. "Reads every contract and flags…", "Builds a hard ROI case for…"). Sentence 2 = the plain result for their team. <= 160 chars total. Do NOT write the offering's name (it is shown separately). No buzzwords, no numbers.
- "metric": a HARD scale figure copied verbatim from THIS item's description/sources (e.g. "250+ engineers", "75,000+ customers", "$3.4B debt", "120+ countries"). This is THEIR real number — the scale at stake. If the facts contain no hard number, return "". NEVER invent or estimate.
- "metricSource": if "metric" is set, the exact source label (from this item's "sources" list) that backs it. Else "".
- "benchmarkCategory": the SINGLE best-fitting category key for the type of automation that solves this pain, chosen from this exact list (return "" if none fit): ${JSON.stringify(BENCHMARK_CATEGORIES)}.
- "appliedScope": a SHORT second-person phrase (<= 42 chars) applying that automation to their scale, reusing THEIR figure verbatim, e.g. "across your 250+ specialists", "across 120+ countries". If "metric" is "", use a generic scope like "across your teams". NEVER put a percentage or projected number here.
- "outcome": leave as "" (unused).

Source pain points (JSON):
${JSON.stringify(input, null, 2)}

Return JSON exactly: {"pains":[{"title":"","problem":"","solution":"","metric":"","metricSource":"","benchmarkCategory":"","appliedScope":"","outcome":""}, ...]} in the SAME ORDER, one object per input item.`;

  const result = await callClaudeJSON<{ pains: ValueFinderCopy["pains"] }>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  });

  // Guard: metricSource must match one of THIS pain's real source labels;
  // otherwise drop both metric and metricSource so nothing unbacked shows.
  const clean = (result?.pains || []).map((p, i) => {
    const validLabels = new Set((pains[i]?.sources || []).map((s) => s.label));
    const metric = (p?.metric || "").trim();
    const metricSource = (p?.metricSource || "").trim();
    const backed = metric && metricSource && validLabels.has(metricSource);
    // benchmarkCategory must be a known library key, else drop it (no impact %).
    const cat = (p?.benchmarkCategory || "").trim();
    const validCat = isBenchmarkCategory(cat) ? cat : "";
    return {
      title: (p?.title || "").trim(),
      problem: (p?.problem || "").trim(),
      solution: (p?.solution || "").trim(),
      impact: (p?.impact || "").trim(),
      outcome: (p?.outcome || "").trim(),
      metric: backed ? metric : "",
      metricSource: backed ? metricSource : "",
      benchmarkCategory: validCat,
      appliedScope: (p?.appliedScope || "").trim(),
    };
  });

  return { pains: clean };
}
