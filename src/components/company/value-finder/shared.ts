// Shared, presentation-free logic for the Value Finder report.
//
// Both design variants (data-room, ledger) derive the SAME data from a
// CompanyDetail + optional generated copy: ranked findings, exec summary,
// source-backed metric strip, maturity band, function opportunities. This
// module owns that derivation so the layout components stay purely visual.
//
// Colours/fonts/spacing live in ./theme.ts. resolveImpact + the benchmark
// library stay in @/lib/value-finder-benchmarks.

import type {
  CompanyDetail,
  PainPoint,
  SolutionMapping,
  ValueFinderCopy,
  ValueFinderPainCopy,
} from "@/lib/types";

// Show the top-N ranked findings in detail (rest summarized in a "+N more" line).
export { TOP_N, VF_DISCLAIMER } from "@/lib/value-finder-shared";

// Safety cap on how many pains we ever process.
export const MAX_PAINS = 12;
export const BOOK_URL = "https://www.techolution.com/contact-us";

export const severityWeight: Record<string, number> = { Critical: 3, High: 2, Medium: 1 };

// Keep cards tight: up to N WHOLE sentences under a soft cap. Never leaves a
// dangling mid-sentence fragment — always ends on terminal punctuation.
// Em/en dashes read as AI-writing tics in a client doc — replace with a comma
// clause break. Real hyphens in compound words (high-severity) are kept.
export function stripDashes(t: string): string {
  return t
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,(\s*[.!?])/g, "$1");
}

export function capText(t: string | undefined, maxSentences = 2, max = 240): string {
  if (!t) return "";
  const sentences = stripDashes(t.replace(/\s+/g, " ").trim()).match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [];
  let out = "";
  for (const raw of sentences.slice(0, maxSentences)) {
    const next = (out ? out + " " : "") + raw.trim();
    if (next.length > max && out) break; // keep only whole sentences that fit
    out = next;
    if (out.length >= max) break;
  }
  out = out.trim();
  const lastEnd = Math.max(out.lastIndexOf("."), out.lastIndexOf("!"), out.lastIndexOf("?"));
  if (lastEnd >= max * 0.4) return out.slice(0, lastEnd + 1);
  return /[.!?]$/.test(out) ? out : out.replace(/[,;:\s]+$/, "") + ".";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtSourceDate(d?: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return d;
  const mo = MONTHS[parseInt(m[2], 10) - 1];
  return mo ? `${mo} ${m[1]}` : m[1];
}

export function mappingFor(company: CompanyDetail, pain: PainPoint): SolutionMapping | undefined {
  const t = pain.title.toLowerCase();
  return (company.solutionMappings || []).find(
    (m) => m.painPoint?.toLowerCase().includes(t) || t.includes((m.painPoint || "").toLowerCase())
  );
}

export function functionOpportunities(company: CompanyDetail): { fn: string; pct: number }[] {
  const scores: Record<string, number> = {};
  (company.painPoints || []).forEach((p) => {
    const w = severityWeight[p.severity] || 1;
    (p.affectedFunctions || []).forEach((f) => {
      scores[f] = (scores[f] || 0) + w;
    });
  });
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...rows.map(([, s]) => s));
  return rows.map(([fn, score]) => ({ fn, pct: Math.round((score / max) * 100) }));
}

export function maturity(company: CompanyDetail): { band: string; ratio: number; segs: number } | null {
  const dim = company.scores?.aiMaturity;
  if (!dim || !dim.maxPoints) return null;
  const ratio = dim.points / dim.maxPoints;
  const band = ratio < 0.4 ? "Early-stage" : ratio < 0.7 ? "Mid-pack" : "Advanced";
  return { band, ratio, segs: Math.min(5, Math.max(1, Math.round(ratio * 5))) };
}

export type EnrichedPain = {
  pain: PainPoint;
  mapping?: SolutionMapping;
  copy?: ValueFinderPainCopy;
  score: number;
};

export function enrichPains(company: CompanyDetail, copy?: ValueFinderCopy): EnrichedPain[] {
  const vf = copy?.pains || [];
  return (company.painPoints || []).map((pain, i) => {
    const mapping = mappingFor(company, pain);
    const c = vf[i];
    const sev = severityWeight[pain.severity] || 1;
    const fit = (mapping?.fitScore ?? 0) / 20;
    return { pain, mapping, copy: c, score: sev * 2 + fit };
  });
}

export function buildExecSummary(ranked: EnrichedPain[], funcs: { fn: string }[]): string {
  const painCount = ranked.length;
  const critCount = ranked.filter((e) => e.pain.severity === "Critical").length;
  const highCount = ranked.filter((e) => e.pain.severity === "High").length;
  const topFns = funcs.slice(0, 2).map((f) => f.fn);
  const sevBits: string[] = [];
  if (critCount) sevBits.push(`${critCount} critical`);
  if (highCount) sevBits.push(`${highCount} high-severity`);
  const head = sevBits.length
    ? `${sevBits.join(" and ")} ${critCount + highCount === 1 ? "gap" : "gaps"}`
    : `${painCount} automation ${painCount === 1 ? "gap" : "gaps"}`;
  return head + (topFns.length ? `, concentrated in ${topFns.join(" and ").toLowerCase()}.` : ".");
}

export function buildBackedMetrics(ranked: EnrichedPain[]): { metric: string; src: string }[] {
  const seen = new Set<string>();
  return ranked
    .map((e) => (e.copy?.metric?.trim() ? { metric: e.copy.metric.trim(), src: (e.copy.metricSource || "").trim() } : null))
    .filter((m): m is { metric: string; src: string } => {
      if (!m) return false;
      const key = m.metric.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

/** One call: everything a report layout needs, derived + ranked. */
export function buildReportModel(company: CompanyDetail, copy?: ValueFinderCopy) {
  const funcs = functionOpportunities(company);
  const enriched = enrichPains(company, copy).slice(0, MAX_PAINS);
  const ranked = [...enriched].sort((a, b) => b.score - a.score);
  const mat = maturity(company);
  const meta = [company.industry, company.subSector, `${company.hqCity}, ${company.state}`]
    .filter(Boolean)
    .join("  ·  ");
  const benchmarkLine =
    copy?.benchmark ||
    (mat ? `Automation maturity: ${mat.band.toLowerCase()}${company.subSector ? ` for ${company.subSector}` : ""}.` : null);
  return {
    funcs,
    ranked,
    painCount: ranked.length,
    mat,
    meta,
    benchmarkLine,
    execSummary: buildExecSummary(ranked, funcs),
    backedMetrics: buildBackedMetrics(ranked),
  };
}
