/**
 * Lusha Decision Makers — company-side stakeholder discovery.
 *
 * `POST /v3/contacts/decision-makers` takes a company domain and returns the
 * company's current, ranked decision makers as FREE previews (verified name,
 * title, seniority, department, LinkedIn URL). creditsCharged is 0 for the
 * preview — credits are only spent when revealing emails/phones via Enrich,
 * which we never call here.
 *
 * This replaces the Gemini-grounded stakeholder researcher as the PRIMARY
 * source (it returns current people with real LinkedIn URLs), which fixes the
 * "ghost stakeholder" problem on thin-web companies. Callers fall back to the
 * Gemini researcher when Lusha has no coverage / errors.
 */

import type { Stakeholder } from "@/lib/types";
import { cleanDomain, levenshtein } from "@/lib/company-match";

const LUSHA_ENDPOINT = "https://api.lusha.com/v3/contacts/decision-makers";
const LUSHA_COMPANY_SEARCH = "https://api.lusha.com/v3/companies/search";
const LUSHA_PROSPECTING = "https://api.lusha.com/v3/contacts/prospecting";

interface LushaDecisionMaker {
  firstName?: string;
  lastName?: string;
  jobTitle?: { title?: string; departments?: string[]; seniority?: string };
  company?: { name?: string; domain?: string };
  location?: { country?: string; state?: string; city?: string };
  socialLinks?: { linkedin?: string };
  error?: { code?: string; message?: string };
}

interface LushaResponse {
  results?: {
    domain?: string;
    decisionMakers?: LushaDecisionMaker[];
    error?: { code?: string; message?: string };
  }[];
  billing?: { creditsCharged?: number; resultsReturned?: number };
}

/**
 * Map Lusha seniority (and title as a fallback signal) → our stakeholder tier.
 * VP is checked FIRST so "Vice President" isn't caught by the /president/ rule
 * and mis-tagged as a Decision Maker (VPs are Champions).
 */
function seniorityToTier(seniority?: string, title?: string): Stakeholder["tier"] {
  const s = (seniority || "").toLowerCase();
  const t = (title || "").toLowerCase();
  if (/vice president|^vp$|svp|evp/.test(s) || /\bvp\b|vice president|\bevp\b|\bsvp\b/.test(t)) return "Champion";
  if (
    /founder|owner|chief|^c[a-z]?o$|c-suite|partner|\bpresident\b|board/.test(s) ||
    /chief|\bpresident\b|\bceo\b|\bcfo\b|\bcio\b|\bcto\b|\bcoo\b|\bciso\b|\bcdo\b/.test(t)
  )
    return "Decision Maker";
  if (/director|head|principal|lead/.test(s)) return "Champion";
  return "Influencer";
}

/**
 * Fetch current decision makers for a company domain and map them to our
 * Stakeholder shape. Returns [] when the key is missing, the company can't be
 * matched, or no people come back — so callers can fall back cleanly.
 */
export async function getDecisionMakers(domain: string, limit = 15): Promise<Stakeholder[]> {
  const apiKey = process.env.LUSHA_API_KEY;
  if (!apiKey) {
    console.log("[lusha] LUSHA_API_KEY not set — skipping decision-makers lookup");
    return [];
  }
  const cleaned = domain ? cleanDomain(domain) : "";
  if (!cleaned) return [];

  let res: Response;
  try {
    res = await fetch(LUSHA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_key: apiKey },
      body: JSON.stringify({
        companies: [{ domain: cleaned }],
        pagination: { page: 0, size: limit },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.log(`[lusha] request failed for ${cleaned}: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`[lusha] ${res.status} for ${cleaned}: ${body.slice(0, 200)}`);
    return [];
  }

  const json = (await res.json().catch(() => null)) as LushaResponse | null;
  const result = json?.results?.[0];
  const people = result?.decisionMakers;
  if (result?.error || !Array.isArray(people) || people.length === 0) {
    console.log(`[lusha] no decision makers for ${cleaned}${result?.error ? ` (${result.error.code})` : ""}`);
    return [];
  }

  const stakeholders: Stakeholder[] = [];
  for (const p of people) {
    if (p.error) continue;
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    const title = p.jobTitle?.title?.trim() || "";
    if (!name || !title) continue;
    const linkedin = p.socialLinks?.linkedin?.trim() || "";
    const dept = p.jobTitle?.departments?.[0];
    stakeholders.push({
      name,
      title,
      tier: seniorityToTier(p.jobTitle?.seniority, title),
      relevance: dept
        ? `${p.jobTitle?.seniority || "Leader"} in ${dept} — relevant to Techolution engagement.`
        : `${p.jobTitle?.seniority || "Leader"} — relevant to Techolution engagement.`,
      source: "Lusha",
      sourceUrl: linkedin,
      confidence: "verified",
    });
  }

  console.log(`[lusha] ${stakeholders.length} decision makers for ${cleaned} (credits: ${json?.billing?.creditsCharged ?? 0})`);
  return stakeholders;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prospecting — PAID last-resort C-suite fetch.
//
// `decision-makers` is free but returns a mid-level buying-committee mix and
// misses the C-suite for large orgs. Prospecting is the only reliable way to
// pull founders/C-suite with LinkedIn, but it charges ~1 credit per RETURNED
// person, so callers use it only when the free layers (Lusha decision-makers +
// Gemini) failed to surface any Decision Maker. We cap the page size hard and
// restrict seniority to founder+C-suite to keep the credit cost tiny (~3-4).
// ─────────────────────────────────────────────────────────────────────────────

interface LushaCompanyMatch {
  id?: string | number;
  name?: string;
  domain?: string;
  error?: { code?: string; message?: string };
}

interface LushaProspectingPerson {
  firstName?: string;
  lastName?: string;
  jobTitle?: { title?: string; departments?: string[]; seniority?: string };
  socialLinks?: { linkedin?: string };
  error?: { code?: string; message?: string };
}

/** Normalize a company name for fuzzy comparison (drop suffixes/punctuation). */
function normalizeCompanyName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|holdings|group|plc|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Guard against Lusha matching the WRONG company (e.g. "PG&E" → "PG&E LLC"
 * subsidiary, or "Sinclair" → Sinclair Broadcast). Trust a domain match above
 * all; otherwise require a close name match. Returns true only when we're
 * confident the matched company is the one we asked for.
 */
function isConfidentMatch(match: LushaCompanyMatch, targetDomain: string, targetName: string): boolean {
  const wantDomain = cleanDomain(targetDomain);
  const gotDomain = cleanDomain(match.domain || "");
  if (wantDomain && gotDomain) return wantDomain === gotDomain;

  const want = normalizeCompanyName(targetName);
  const got = normalizeCompanyName(match.name || "");
  if (!want || !got) return false;
  if (want === got || got.includes(want) || want.includes(got)) return true;
  const max = Math.max(want.length, got.length);
  return max > 0 && 1 - levenshtein(want, got) / max >= 0.8;
}

interface LushaPostResult {
  results?: unknown[];
  billing?: { creditsCharged?: number };
}

async function lushaPost(
  endpoint: string,
  apiKey: string,
  body: unknown,
): Promise<{ json: LushaPostResult | null; status: number } | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_key: apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 429) {
      console.log(`[lusha] 429 daily API cap hit on ${endpoint} — falling back`);
      return { json: null, status: 429 };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.log(`[lusha] ${res.status} on ${endpoint}: ${t.slice(0, 200)}`);
      return { json: null, status: res.status };
    }
    return { json: await res.json().catch(() => null), status: res.status };
  } catch (err) {
    console.log(`[lusha] request to ${endpoint} failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * PAID: resolve the company, then pull its founder/C-suite (seniority 10, 9)
 * with LinkedIn. Returns [] on missing key, no/ambiguous company match, 429,
 * or no contacts — so callers fall back cleanly to the Gemini path.
 */
export async function getProspectingStakeholders(
  domain: string,
  companyName: string,
  limit = 4,
): Promise<Stakeholder[]> {
  const apiKey = process.env.LUSHA_API_KEY;
  if (!apiKey) {
    console.log("[lusha] LUSHA_API_KEY not set — skipping prospecting");
    return [];
  }
  const cleaned = domain ? cleanDomain(domain) : "";
  const searchBody = { companies: [cleaned ? { domain: cleaned } : { name: companyName }] };

  const search = await lushaPost(LUSHA_COMPANY_SEARCH, apiKey, searchBody);
  if (!search || !search.json) return [];
  const match = ((search.json.results as LushaCompanyMatch[]) || []).find((c) => c && !c.error && c.id);
  if (!match?.id) {
    console.log(`[lusha] prospecting: no company match for ${companyName}`);
    return [];
  }
  if (!isConfidentMatch(match, domain, companyName)) {
    console.log(`[lusha] prospecting: rejected ambiguous match "${match.name}" (${match.domain}) for ${companyName}`);
    return [];
  }

  const prospect = await lushaPost(LUSHA_PROSPECTING, apiKey, {
    filters: { companies: { include: { ids: [match.id] } }, contacts: { include: { seniority: [10, 9] } } },
    pagination: { page: 0, size: limit },
  });
  if (!prospect || !prospect.json) return [];
  const people = ((prospect.json.results as LushaProspectingPerson[]) || []).filter((p) => p && !p.error);

  const stakeholders: Stakeholder[] = [];
  for (const p of people) {
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    const title = p.jobTitle?.title?.trim() || "";
    if (!name || !title) continue;
    const dept = p.jobTitle?.departments?.[0];
    stakeholders.push({
      name,
      title,
      tier: seniorityToTier(p.jobTitle?.seniority, title),
      relevance: dept
        ? `${p.jobTitle?.seniority || "Leader"} in ${dept} — relevant to Techolution engagement.`
        : `${p.jobTitle?.seniority || "Leader"} — relevant to Techolution engagement.`,
      source: "Lusha",
      sourceUrl: p.socialLinks?.linkedin?.trim() || "",
      confidence: "verified",
    });
  }

  const credits = prospect.json?.billing?.creditsCharged ?? 0;
  console.log(`[lusha] prospecting: ${stakeholders.length} C-suite for ${match.name} (credits: ${credits})`);
  return stakeholders;
}
