/**
 * Company matching for research dedup.
 *
 * The "already researched?" cache must recognise the same company across name
 * variants, typos, corporate suffixes, and pasted domains — otherwise "Darling",
 * "Darling Ingredients", and "darling ingridients" each trigger a full fresh
 * research run. These are pure functions (no DB) so they're unit-testable.
 *
 * A `similar` match is NEVER auto-merged by callers — it is surfaced to the user
 * to confirm, which guards against merging two genuinely different companies
 * with lookalike names.
 */

export type MatchType = "domain" | "linkedin" | "exact" | "similar";

export interface MatchCandidate {
  slug: string;
  name: string | null;
  domain?: string | null;
}

export interface MatchResult {
  slug: string;
  name: string | null;
  matchType: MatchType;
}

// Trailing corporate suffixes that don't distinguish a company.
const SUFFIXES =
  /\b(incorporated|inc|corporation|corp|company|co|llc|lllp|llp|lp|ltd|limited|plc|group|holdings|holding|sa|ag|gmbh|nv|bv|spa|srl|pty|pvt)\b/g;

/** Lowercase, drop punctuation + corporate suffixes, collapse whitespace. */
export function canonicalName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip protocol / www / path so only the root domain remains. */
export function cleanDomain(input: string): string {
  return (input || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 0; i < a.length; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity (1 = identical). */
function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/** True when every token of the shorter name appears in the longer one. */
function tokenSubset(a: string, b: string): boolean {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t));
}

const SIMILAR_THRESHOLD = 0.85;

/**
 * Find the best matching candidate for a typed company input.
 * Priority: domain (strongest) → exact canonical name → similar (typo/subset).
 * Returns null when nothing matches.
 */
export function matchCompany(
  name: string,
  domain: string | undefined,
  candidates: MatchCandidate[]
): MatchResult | null {
  // 1. Domain match — strongest signal when the user pasted a URL/domain.
  const inDomain = domain ? cleanDomain(domain) : "";
  if (inDomain) {
    const hit = candidates.find((c) => c.domain && cleanDomain(c.domain) === inDomain);
    if (hit) return { slug: hit.slug, name: hit.name, matchType: "domain" };
  }

  const cn = canonicalName(name);
  if (!cn) return null;

  // 2. Exact canonical-name match (suffix/punctuation-insensitive).
  const exact = candidates.find((c) => canonicalName(c.name || c.slug) === cn);
  if (exact) return { slug: exact.slug, name: exact.name, matchType: "exact" };

  // 3. Similar — typo (Levenshtein) or partial name (token subset).
  let best: { c: MatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    const ccn = canonicalName(c.name || c.slug);
    if (!ccn) continue;
    const subset = tokenSubset(cn, ccn);
    const r = ratio(cn, ccn);
    if (subset || r >= SIMILAR_THRESHOLD) {
      const score = subset ? 1 : r;
      if (!best || score > best.score) best = { c, score };
    }
  }
  if (best) return { slug: best.c.slug, name: best.c.name, matchType: "similar" };

  return null;
}

// ─── Stakeholder (person) matching ──────────────────────────────────────────
// Same problem for people: exact name+company matching let "Robert Day",
// "Robert (Bob) Day", and "Bob Day" each spawn a separate (paid) deep analysis
// of the same person. A person's LinkedIn URL is their canonical identity.

export interface StakeholderCandidate {
  key: string; // profile id used to map the match back to the DB row
  name: string;
  company: string | null;
  linkedinUrl: string | null;
}

export interface StakeholderMatch {
  key: string;
  matchType: MatchType;
}

/** Reduce a LinkedIn profile URL to its /in/<slug> handle (lowercased). */
export function canonicalLinkedIn(url: string | null | undefined): string {
  if (!url) return "";
  const m = url.match(/linkedin\.com\/in\/([a-z0-9\-_%]+)/i);
  return m ? m[1].replace(/\/$/, "").toLowerCase() : "";
}

/** Same company? Unknown on either side doesn't block; else exact or subset. */
function companyCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalName(a || "");
  const cb = canonicalName(b || "");
  if (!ca || !cb) return true;
  return ca === cb || tokenSubset(ca, cb);
}

/**
 * Find an existing analysis of the same person.
 * Priority: LinkedIn URL (identity) → exact name (+compatible company) →
 * similar name (typo/partial, +compatible company). Company guards against two
 * different people who share a name. `similar` is surfaced, never auto-merged.
 */
export function matchStakeholder(
  input: { name: string; company?: string | null; linkedinUrl?: string | null },
  candidates: StakeholderCandidate[]
): StakeholderMatch | null {
  // 1. LinkedIn URL — same handle means same person, regardless of company.
  const inLi = canonicalLinkedIn(input.linkedinUrl);
  if (inLi) {
    const hit = candidates.find((c) => canonicalLinkedIn(c.linkedinUrl) === inLi);
    if (hit) return { key: hit.key, matchType: "linkedin" };
  }

  const cn = canonicalName(input.name);
  if (!cn) return null;

  // 2. Exact canonical name + compatible company.
  const exact = candidates.find(
    (c) => canonicalName(c.name) === cn && companyCompatible(input.company, c.company)
  );
  if (exact) return { key: exact.key, matchType: "exact" };

  // 3. Similar name (typo/partial) + compatible company.
  let best: { c: StakeholderCandidate; score: number } | null = null;
  for (const c of candidates) {
    const ccn = canonicalName(c.name);
    if (!ccn || !companyCompatible(input.company, c.company)) continue;
    const subset = tokenSubset(cn, ccn);
    const r = ratio(cn, ccn);
    if (subset || r >= SIMILAR_THRESHOLD) {
      const score = subset ? 1 : r;
      if (!best || score > best.score) best = { c, score };
    }
  }
  if (best) return { key: best.c.key, matchType: "similar" };

  return null;
}
