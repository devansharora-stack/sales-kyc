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
import { cleanDomain } from "@/lib/company-match";

const LUSHA_ENDPOINT = "https://api.lusha.com/v3/contacts/decision-makers";

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

/** Map Lusha seniority → our stakeholder tier. */
function seniorityToTier(seniority?: string): Stakeholder["tier"] {
  const s = (seniority || "").toLowerCase();
  if (/founder|owner|chief|^c[a-z]?o$|partner|president|board/.test(s)) return "Decision Maker";
  if (/vice president|^vp$|svp|evp/.test(s)) return "Decision Maker";
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
      tier: seniorityToTier(p.jobTitle?.seniority),
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
