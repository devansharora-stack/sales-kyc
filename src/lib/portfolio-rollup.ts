/**
 * Deterministic pre-processing for the portfolio-rollup GTM agent.
 *
 * Principle: NUMBERS IN CODE, NARRATIVE IN THE LLM. Everything quantitative —
 * aggregate opportunity, shared entry-motion counts, account tiering signals,
 * segment grouping, buying-committee tallies, objective data-quality flags — is
 * computed here so the model can never hallucinate them. The agent only writes
 * the synthesis prose grounded in these facts.
 */

import type { CompanyDetail, Rating, GeminiStatus } from "@/lib/types";
import { ALL_SOLUTIONS } from "@/lib/types";

export interface AccountSummary {
  slug: string;
  name: string;
  industry: string;
  subSector: string;
  totalScore: number;
  rating: Rating;
  urgency: string;
  geminiStatus: GeminiStatus;
  entrySolution: string; // human-readable solution name
  opportunityScore?: number;
  estimatedFirstYear: string;
  estimatedExpansion: string;
  salesMotion?: string;
  cycleLength?: string;
  freshestTrigger?: { event: string; date: string; ageDays: number | null; category: string };
  topPains: string[];
  decisionMakers: { name: string; title: string }[];
  champions: { name: string; title: string }[];
  strikeScore: number;
  defaultTier: 1 | 2 | 3;
  flags: string[];
}

export interface PortfolioFacts {
  projectName: string;
  accountCount: number;
  aggregateFirstYear: string;
  aggregateExpansion: string;
  entryMotionCounts: { solution: string; count: number }[];
  topEntryMotion?: { solution: string; count: number };
  tierCounts: { tier1: number; tier2: number; tier3: number };
  segments: { segment: string; accounts: string[] }[];
  committeeRoleTally: { role: string; accounts: number }[];
  dataQualityFlags: string[];
  accounts: AccountSummary[];
}

const DAY = 86_400_000;
const solutionName = (id: string) => ALL_SOLUTIONS.find((s) => s.id === id)?.name ?? id;

// ─── Money-range parsing ─────────────────────────────────────────────────────
// Handles "$400–800K", "$300-500K", "$500K–$1M", "$1.8B", "$250K", "$0.5M–$5M/yr".

const SUFFIX_MULT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

export function parseMoneyRange(input: string | undefined): { low: number; high: number; mid: number } | null {
  if (!input) return null;
  const cleaned = input.replace(/\/\s*yr|per year|annually|~|approx\.?/gi, "");
  const tokens = [...cleaned.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)\s*([kmb])?/gi)]
    .map((m) => ({ num: parseFloat(m[1].replace(/,/g, "")), suffix: (m[2] || "").toLowerCase() }))
    .filter((t) => Number.isFinite(t.num));
  if (tokens.length === 0) return null;

  // A bare leading number ("400" in "400–800K") inherits the next token's suffix.
  const trailingSuffix = tokens.map((t) => t.suffix).reverse().find((s) => s) || "";
  const values = tokens.map((t) => t.num * (SUFFIX_MULT[t.suffix || trailingSuffix] ?? 1));

  const low = Math.min(...values);
  const high = Math.max(...values);
  return { low, high, mid: (low + high) / 2 };
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  const round1 = (x: number) => (x % 1 === 0 ? String(x) : x.toFixed(1));
  if (n >= 1e9) return `$${round1(n / 1e9)}B`;
  if (n >= 1e6) return `$${round1(n / 1e6)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

// ─── Trigger recency ─────────────────────────────────────────────────────────

function freshestTrigger(company: CompanyDetail): AccountSummary["freshestTrigger"] {
  let best: { event: string; date: string; ts: number; category: string } | null = null;
  for (const t of company.triggerEvents || []) {
    if (!t?.date) continue;
    const ts = Date.parse(t.date);
    if (Number.isNaN(ts)) continue;
    if (!best || ts > best.ts) best = { event: t.event, date: t.date, ts, category: t.category };
  }
  if (!best) {
    const first = (company.triggerEvents || [])[0];
    return first ? { event: first.event, date: first.date, ageDays: null, category: first.category } : undefined;
  }
  return { event: best.event, date: best.date, ageDays: Math.max(0, Math.floor((Date.now() - best.ts) / DAY)), category: best.category };
}

// ─── Buying-committee role bucketing ─────────────────────────────────────────

const ROLE_BUCKETS: { role: string; re: RegExp }[] = [
  { role: "Chief AI Officer", re: /chief ai|\bcaio\b|chief artificial/i },
  { role: "CIO", re: /\bcio\b|chief information officer/i },
  { role: "CTO", re: /\bcto\b|chief technology/i },
  { role: "CDO", re: /\bcdo\b|chief data|chief digital/i },
  { role: "CISO", re: /\bciso\b|chief information security/i },
  { role: "CFO", re: /\bcfo\b|chief financial/i },
  { role: "CEO / President", re: /\bceo\b|chief executive|\bpresident\b/i },
  { role: "COO", re: /\bcoo\b|chief operating/i },
  { role: "VP / Head of IT / Technology", re: /vp|vice president|head of|director/i },
];

function roleBucket(title: string): string | null {
  for (const b of ROLE_BUCKETS) if (b.re.test(title)) return b.role;
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function summarize(company: CompanyDetail): AccountSummary {
  const opp = company.salesIntelligence?.opportunityValue;
  const motion = company.salesIntelligence?.salesMotion;
  const urgency = company.gtm?.urgency || "Medium";
  const dms = (company.stakeholders || []).filter((s) => s.tier === "Decision Maker").map((s) => ({ name: s.name, title: s.title }));
  const champions = (company.stakeholders || []).filter((s) => s.tier === "Champion").map((s) => ({ name: s.name, title: s.title }));
  const trigger = freshestTrigger(company);

  const flags: string[] = [];
  if (dms.length === 0) flags.push("no Decision Maker identified");
  if ((company.stakeholders || []).length < 3) flags.push("thin stakeholder list (<3)");
  if ((company.triggerEvents || []).length === 0) flags.push("no trigger events");
  if ((company.totalScore ?? 0) < 50) flags.push("low fit score (<50)");

  const oppScore = opp?.score;
  const freshTrigger = trigger?.ageDays !== null && trigger?.ageDays !== undefined && trigger.ageDays <= 90;
  const strikeScore =
    (company.totalScore ?? 0) +
    (/very high/i.test(urgency) ? 15 : /high/i.test(urgency) ? 8 : 0) +
    (typeof oppScore === "number" ? (oppScore >= 9 ? 15 : oppScore >= 7 ? 8 : 0) : 0) +
    (freshTrigger ? 15 : 0) +
    (dms.length > 0 ? 10 : 0);

  return {
    slug: company.slug,
    name: company.name,
    industry: company.industry || "Unknown",
    subSector: company.subSector || company.industry || "Unknown",
    totalScore: company.totalScore ?? 0,
    rating: company.rating,
    urgency,
    geminiStatus: company.geminiStatus,
    entrySolution: solutionName(company.gtm?.entrySolution || ""),
    opportunityScore: oppScore,
    estimatedFirstYear: opp?.estimatedFirstYear || "",
    estimatedExpansion: opp?.estimatedExpansion || "",
    salesMotion: motion?.motion,
    cycleLength: motion?.cycleLength,
    freshestTrigger: trigger,
    topPains: (company.painPoints || []).slice(0, 2).map((p) => p.title),
    decisionMakers: dms.slice(0, 4),
    champions: champions.slice(0, 4),
    strikeScore,
    defaultTier: 3,
    flags,
  };
}

/** Rank by strike score, then bucket into tiers proportional to project size. */
function assignTiers(accounts: AccountSummary[]): { tier1: number; tier2: number; tier3: number } {
  const ranked = [...accounts].sort((a, b) => b.strikeScore - a.strikeScore);
  const n = ranked.length;
  const t1 = Math.min(12, Math.max(n <= 4 ? 1 : 3, Math.ceil(n * 0.25)));
  const t2 = Math.ceil(n * 0.4);
  ranked.forEach((acc, i) => {
    acc.defaultTier = i < t1 ? 1 : i < t1 + t2 ? 2 : 3;
  });
  return { tier1: t1, tier2: Math.min(t2, Math.max(0, n - t1)), tier3: Math.max(0, n - t1 - t2) };
}

export function buildPortfolioFacts(projectName: string, companies: CompanyDetail[]): PortfolioFacts {
  const accounts = companies.map(summarize);
  const tierCounts = assignTiers(accounts);

  // Aggregate opportunity (sum of per-account midpoints of parseable ranges).
  let y1 = 0;
  let exp = 0;
  for (const a of accounts) {
    y1 += parseMoneyRange(a.estimatedFirstYear)?.mid ?? 0;
    exp += parseMoneyRange(a.estimatedExpansion)?.mid ?? 0;
  }

  // Shared entry motion.
  const motionMap = new Map<string, number>();
  for (const a of accounts) if (a.entrySolution) motionMap.set(a.entrySolution, (motionMap.get(a.entrySolution) || 0) + 1);
  const entryMotionCounts = [...motionMap.entries()].map(([solution, count]) => ({ solution, count })).sort((x, y) => y.count - x.count);

  // Segments by sub-sector.
  const segMap = new Map<string, string[]>();
  for (const a of accounts) {
    const arr = segMap.get(a.subSector) || [];
    arr.push(a.name);
    segMap.set(a.subSector, arr);
  }
  const segments = [...segMap.entries()].map(([segment, accts]) => ({ segment, accounts: accts })).sort((x, y) => y.accounts.length - x.accounts.length);

  // Buying-committee role tally (# accounts that have at least one person in the bucket).
  const roleMap = new Map<string, number>();
  for (const a of accounts) {
    const seen = new Set<string>();
    for (const p of [...a.decisionMakers, ...a.champions]) {
      const bucket = roleBucket(p.title);
      if (bucket && !seen.has(bucket)) {
        seen.add(bucket);
        roleMap.set(bucket, (roleMap.get(bucket) || 0) + 1);
      }
    }
  }
  const committeeRoleTally = [...roleMap.entries()].map(([role, accts]) => ({ role, accounts: accts })).sort((x, y) => y.accounts - x.accounts);

  // Portfolio-level data-quality flags.
  const noDM = accounts.filter((a) => a.decisionMakers.length === 0);
  const thin = accounts.filter((a) => a.flags.includes("thin stakeholder list (<3)"));
  const dataQualityFlags: string[] = [];
  if (noDM.length) dataQualityFlags.push(`${noDM.length} account(s) have no Decision Maker: ${noDM.map((a) => a.name).join(", ")}`);
  if (thin.length) dataQualityFlags.push(`${thin.length} account(s) have a thin stakeholder list (<3): ${thin.map((a) => a.name).join(", ")}`);
  const noTriggers = accounts.filter((a) => a.flags.includes("no trigger events"));
  if (noTriggers.length) dataQualityFlags.push(`${noTriggers.length} account(s) have no trigger events: ${noTriggers.map((a) => a.name).join(", ")}`);

  return {
    projectName,
    accountCount: accounts.length,
    aggregateFirstYear: formatMoney(y1),
    aggregateExpansion: formatMoney(exp),
    entryMotionCounts,
    topEntryMotion: entryMotionCounts[0],
    tierCounts,
    segments,
    committeeRoleTally,
    dataQualityFlags,
    accounts,
  };
}
