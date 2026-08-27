"use client";

// Client-facing one-pager lead magnet. Must fit ONE A4 page. Tone: direct
// outreach to someone AT the company (not a third-person company writeup).
//
// Blueprint (Nikhil's feedback + lead-magnet research → "must feel like a tool"):
//   - Techolution brand band (NO "Value Finder" tag — we have many offerings)
//   - Company name + basic details
//   - HERO: big quantified $ range + a visual automation-maturity meter
//     (band, not a /100 score) with the comparative peer line
//   - "Automation Opportunity by Function" bars with % labels
//   - RANKED priority CARDS (#1..#N by composite score): pain + how AI solves it
//     + a $ outcome chip; severity accent stripe
//   - ONE CTA (book time). Tool, not brochure. Second person throughout.
//
// Three modes:
//   - "plain": original minimal diagnosis sheet (kept for comparison).
//   - "tease": top 2 priorities + "+N more"; problem teaser only.
//   - "full":  top 4 priorities, each with how AI solves it + outcome.

import type { CompanyDetail, PainPoint, SolutionMapping, EstimatedImpact, ValueFinderCopy, ValueFinderPainCopy } from "@/lib/types";

const COBALT = "#3289FF";
const NAVY = "#0B1F3A";
const MAX_FULL_PAINS = 4;
const TEASE_PAINS = 2;
const HOOK_TOP_N = 3;

const severityWeight: Record<string, number> = { Critical: 3, High: 2, Medium: 1 };
const severityTone: Record<string, string> = { Critical: "#DC2626", High: "#EA580C", Medium: "#CA8A04" };

const clamp = (t: string | undefined, n: number) => {
  if (!t) return "";
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
};

function impactSummary(m?: SolutionMapping): string | null {
  if (!m) return null;
  const ei = m.estimatedImpact as string | EstimatedImpact | undefined;
  if (!ei) return null;
  return typeof ei === "string" ? ei : ei.summary;
}

function mappingFor(company: CompanyDetail, pain: PainPoint): SolutionMapping | undefined {
  const t = pain.title.toLowerCase();
  return (company.solutionMappings || []).find(
    (m) => m.painPoint?.toLowerCase().includes(t) || t.includes((m.painPoint || "").toLowerCase())
  );
}

function parseMoney(s: string | null | undefined): { low: number; high: number } | null {
  if (!s) return null;
  const m = s.match(/\$\s?(\d+(?:\.\d+)?)\s?(?:[-–]\s?(\d+(?:\.\d+)?))?\s?([KMB])/i);
  if (!m) return null;
  const mult = ({ K: 1e3, M: 1e6, B: 1e9 } as const)[m[3].toUpperCase() as "K" | "M" | "B"];
  const low = parseFloat(m[1]) * mult;
  const high = (m[2] ? parseFloat(m[2]) : parseFloat(m[1])) * mult;
  return { low, high };
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function moneyBand(high: number): number {
  if (high >= 50e6) return 3;
  if (high >= 10e6) return 2;
  if (high >= 1e6) return 1;
  return 0;
}

function functionOpportunities(company: CompanyDetail): { fn: string; pct: number }[] {
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

function maturity(company: CompanyDetail): { band: string; segs: number } | null {
  const dim = company.scores?.aiMaturity;
  if (!dim || !dim.maxPoints) return null;
  const ratio = dim.points / dim.maxPoints;
  const band = ratio < 0.4 ? "Early-stage" : ratio < 0.7 ? "Mid-pack" : "Advanced";
  return { band, segs: Math.min(5, Math.max(1, Math.round(ratio * 5))) };
}

type EnrichedPain = {
  pain: PainPoint;
  mapping?: SolutionMapping;
  copy?: ValueFinderPainCopy;
  outcomeText: string;
  money: { low: number; high: number } | null;
  score: number;
};

function enrichPains(company: CompanyDetail, copy?: ValueFinderCopy): EnrichedPain[] {
  const vf = copy?.pains || [];
  return (company.painPoints || []).map((pain, i) => {
    const mapping = mappingFor(company, pain);
    const c = vf[i];
    const outcomeText = c?.outcome || impactSummary(mapping) || "";
    const money = parseMoney(outcomeText);
    const sev = severityWeight[pain.severity] || 1;
    const fit = (mapping?.fitScore ?? 0) / 20;
    const band = money ? moneyBand(money.high) : 0;
    return { pain, mapping, copy: c, outcomeText, money, score: sev * 2 + fit + band };
  });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="w-1 h-3.5 rounded-full" style={{ background: COBALT }} />
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h2>
    </div>
  );
}

export default function ValueFinderView({
  company,
  mode,
  copy,
}: {
  company: CompanyDetail;
  mode: "plain" | "tease" | "full";
  copy?: ValueFinderCopy;
}) {
  const isPlain = mode === "plain";
  const funcs = functionOpportunities(company);
  const cap = mode === "full" ? MAX_FULL_PAINS : isPlain ? MAX_FULL_PAINS : TEASE_PAINS;
  const painClamp = mode === "tease" ? 150 : 130;

  const enriched = enrichPains(company, copy);
  const ranked = isPlain ? enriched : [...enriched].sort((a, b) => b.score - a.score);
  const shown = ranked.slice(0, cap);
  const remaining = Math.max(0, enriched.length - shown.length);
  const painCount = enriched.length;

  const hookMoney = ranked.slice(0, HOOK_TOP_N).map((e) => e.money).filter(Boolean) as { low: number; high: number }[];
  const hookRange = hookMoney.length
    ? { low: hookMoney.reduce((s, m) => s + m.low, 0), high: hookMoney.reduce((s, m) => s + m.high, 0) }
    : null;

  const mat = maturity(company);
  const benchmarkLine =
    copy?.benchmark ||
    (mat ? `Automation maturity: ${mat.band.toLowerCase()}${company.subSector ? ` for ${company.subSector}` : ""}.` : null);

  // ---- PLAIN: keep the original minimal sheet ----
  if (isPlain) {
    return (
      <div className="vf-sheet bg-white text-slate-900 mx-auto" style={{ maxWidth: 820 }}>
        <div className="flex items-center justify-between rounded-t-lg px-5 py-2" style={{ background: NAVY }}>
          <span className="text-[12px] font-bold uppercase tracking-[0.24em] text-white">Techolution</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: "#8FC0FF" }}>Enterprise AI &amp; Automation</span>
        </div>
        <div className="px-1 pt-4 pb-3 border-b border-slate-200">
          <h1 className="text-[30px] leading-none font-bold text-slate-900">{company.name}</h1>
          <p className="text-[13px] text-slate-500 mt-1.5">
            {[company.industry, company.subSector, `${company.hqCity}, ${company.state}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="mt-4 rounded-lg bg-[#F5F9FF] border border-[#DCEAFF] px-5 py-3">
          <p className="text-[14px] font-semibold text-slate-800 leading-snug">
            We analyzed {company.name}&apos;s public signals and found{" "}
            <span style={{ color: COBALT }}>{painCount} automation {painCount === 1 ? "opportunity" : "opportunities"}</span>
            {funcs.length > 0 && <> across {funcs.length} business {funcs.length === 1 ? "function" : "functions"}</>}.
          </p>
        </div>
        {funcs.length > 0 && (
          <div className="mt-4">
            <SectionLabel>Automation Opportunity by Function</SectionLabel>
            <div className="space-y-1.5">
              {funcs.map((f) => (
                <div key={f.fn} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-[13px] text-slate-600 truncate">{f.fn}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: COBALT }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5">
          <SectionLabel>What We Found &amp; How AI Solves It</SectionLabel>
          <div className="space-y-3">
            {shown.map((e, i) => {
              const p = e.pain;
              const c = e.copy;
              const solution = c?.solution || (e.mapping?.value ? clamp(e.mapping.value, 155) : "");
              const outcome = c?.outcome ? clamp(c.outcome, 85) : clamp(e.outcomeText, 85);
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-[5px] shrink-0 w-2 h-2 rounded-full" style={{ background: severityTone[p.severity] || "#64748B" }} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-slate-800 leading-snug">{c?.title || p.title}</p>
                    {solution ? (
                      <p className="text-[12.5px] text-slate-600 leading-relaxed mt-0.5">
                        <span className="font-semibold" style={{ color: COBALT }}>How AI solves it: </span>
                        {solution}
                        {outcome && <span className="text-slate-900 font-medium"> {outcome}</span>}
                      </p>
                    ) : (
                      <p className="text-[12.5px] text-slate-500 leading-relaxed mt-0.5">{clamp(p.description, painClamp)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {remaining > 0 && (
            <div className="mt-3 rounded-lg border-2 border-dashed border-[#B9D6FF] bg-[#F5F9FF] px-4 py-2.5">
              <p className="text-[15px] font-bold" style={{ color: COBALT }}>+{remaining} more pain {remaining === 1 ? "point" : "points"} identified</p>
            </div>
          )}
        </div>
        <div className="mt-5 rounded-lg p-4 text-center text-white" style={{ background: `linear-gradient(135deg, ${COBALT}, #1E6BE0)` }}>
          <p className="text-[15px] font-bold">We&apos;ve done our homework on {company.name}.</p>
        </div>
      </div>
    );
  }

  // ---- TEASE / FULL: premium "tool" design ----
  return (
    <div className="vf-sheet bg-white text-slate-900 mx-auto" style={{ maxWidth: 820 }}>
      {/* Brand band */}
      <div className="flex items-center justify-between rounded-t-xl px-6 py-2.5" style={{ background: NAVY }}>
        <span className="text-[13px] font-bold uppercase tracking-[0.26em] text-white">Techolution</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8FC0FF" }}>Enterprise AI &amp; Automation</span>
      </div>

      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <h1 className="text-[32px] leading-none font-extrabold tracking-tight text-slate-900">{company.name}</h1>
        <p className="text-[12.5px] text-slate-500 mt-2">
          {[company.industry, company.subSector, `${company.hqCity}, ${company.state}`].filter(Boolean).join("  ·  ")}
        </p>
        <p className="text-[13px] text-slate-700 mt-3 leading-snug">
          We analyzed {company.name}&apos;s public signals and mapped{" "}
          <span className="font-semibold" style={{ color: COBALT }}>{painCount} automation {painCount === 1 ? "opportunity" : "opportunities"}</span>{" "}
          — ranked by impact.
        </p>
      </div>

      {/* HERO row: $ opportunity + maturity meter */}
      <div className="px-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${COBALT}, #1E6BE0)` }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">Opportunity identified</p>
          {hookRange ? (
            <p className="text-[26px] font-extrabold leading-none mt-1.5">{fmtMoney(hookRange.low)}–{fmtMoney(hookRange.high)}<span className="text-[14px] font-bold opacity-80">/yr</span></p>
          ) : (
            <p className="text-[26px] font-extrabold leading-none mt-1.5">{painCount}<span className="text-[14px] font-bold opacity-80"> opportunities</span></p>
          )}
          <p className="text-[10.5px] opacity-85 mt-1.5">in efficiency gains across your top priorities</p>
        </div>
        <div className="rounded-xl p-4 border border-slate-200 bg-slate-50">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Automation maturity</p>
          {mat ? (
            <>
              <p className="text-[20px] font-extrabold leading-none mt-1.5 text-slate-800">{mat.band}</p>
              <div className="flex gap-1 mt-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="h-2 flex-1 rounded-full" style={{ background: i < mat.segs ? COBALT : "#E2E8F0" }} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-slate-500 mt-2">Assessment in progress</p>
          )}
          {benchmarkLine && <p className="text-[10.5px] text-slate-500 mt-2 leading-snug">{benchmarkLine}</p>}
        </div>
      </div>

      {/* Function bars with % */}
      {funcs.length > 0 && (
        <div className="px-6 mt-5">
          <SectionLabel>Automation Opportunity by Function</SectionLabel>
          <div className="space-y-2">
            {funcs.map((f) => (
              <div key={f.fn} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-[12.5px] font-medium text-slate-600 truncate">{f.fn}</span>
                <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${f.pct}%`, background: `linear-gradient(90deg, ${COBALT}, #6BA9FF)` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-[11.5px] font-bold" style={{ color: COBALT }}>{f.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranked priority cards */}
      <div className="px-6 mt-5">
        <SectionLabel>Your Priorities — Ranked</SectionLabel>
        <div className="space-y-2.5">
          {shown.map((e, i) => {
            const p = e.pain;
            const c = e.copy;
            const title = c?.title || p.title;
            const problem = c?.problem || clamp(p.description, painClamp);
            const solution = c?.solution || (e.mapping?.value ? clamp(e.mapping.value, 150) : "");
            const chip = e.money ? `${fmtMoney(e.money.low)}–${fmtMoney(e.money.high)}/yr` : null;
            return (
              <div
                key={i}
                className="relative rounded-lg border border-slate-200 bg-white pl-4 pr-3.5 py-3 overflow-hidden"
                style={{ boxShadow: "0 1px 2px rgba(15,31,58,0.04)" }}
              >
                {/* severity accent stripe */}
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: severityTone[p.severity] || "#64748B" }} />
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-lg text-white text-[13px] font-extrabold flex items-center justify-center" style={{ background: COBALT }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-bold text-slate-900 leading-snug">{title}</p>
                      {chip && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#EAF2FF", color: COBALT }}>{chip}</span>}
                    </div>
                    {mode === "tease" ? (
                      <p className="text-[12px] text-slate-500 leading-relaxed mt-1">{problem}</p>
                    ) : (
                      <p className="text-[12px] text-slate-600 leading-relaxed mt-1">
                        <span className="font-semibold" style={{ color: COBALT }}>How AI solves it: </span>{solution}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {remaining > 0 && (
          <div className="mt-2.5 rounded-lg border-2 border-dashed border-[#B9D6FF] bg-[#F5F9FF] px-4 py-2.5 flex items-center justify-between">
            <p className="text-[14px] font-bold" style={{ color: COBALT }}>+{remaining} more {remaining === 1 ? "priority" : "priorities"} identified</p>
            <p className="text-[11px] text-slate-500">
              {mode === "tease" ? "Reply for the full ranked breakdown." : "Full mapping on request."}
            </p>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-6 mt-5 pb-1">
        <div className="rounded-xl p-4 flex items-center justify-between gap-4 text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, #16345C)` }}>
          <div>
            <p className="text-[15px] font-bold">We&apos;ve done our homework on {company.name}.</p>
            <p className="text-[12px] opacity-85 mt-0.5">
              {mode === "tease"
                ? "Reply to get the full ranked one-pager — every priority and how we'd automate it. Free."
                : "Ready to walk through your top priorities? Let's book 20 minutes."}
            </p>
          </div>
          <span className="shrink-0 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: COBALT }}>
            {mode === "tease" ? "Get the full sheet →" : "Book 20 min →"}
          </span>
        </div>
      </div>
    </div>
  );
}
