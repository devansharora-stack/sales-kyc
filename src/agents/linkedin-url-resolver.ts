/**
 * LinkedIn URL Resolver
 *
 * Validated Phase 0 (memory: stakeholder-scraping-method):
 *  - PRIMARY  = Claude web_search (callClaudeWithTools) — 4/4 correct, free,
 *    disambiguates the right person by reasoning over headline/role.
 *  - BACKUP   = Apify search actor company-name filter (deterministic).
 *  - Gemini grounding CANNOT return personal /in/ URLs — do NOT use it here.
 *
 * Returns the resolved URL + confidence. Low confidence → orchestrator marks
 * the stakeholder needs_confirmation rather than scraping a guess.
 */

import { callClaudeWithTools } from "@/lib/claude";
import { searchLinkedInUrl } from "@/lib/apify";

const LINKEDIN_IN_RE = /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i;

export interface ResolvedUrl {
  url: string | null;
  confidence: "high" | "low";
  via: "claude" | "apify" | "none";
  reason?: string;
  /** True when the person has left / no longer holds the role at the company. */
  departed?: boolean;
}

interface ClaudeResolution {
  linkedinUrl?: string;
  confidence?: string;
  why?: string;
  /** False if the person has left / no longer holds the role at the company. */
  stillAtCompany?: boolean;
}

function normalizeIn(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(LINKEDIN_IN_RE);
  return m ? m[0].replace(/\/$/, "") : null;
}

export async function resolveLinkedInUrl(
  name: string,
  company?: string,
  title?: string,
): Promise<ResolvedUrl> {
  // 1) Claude web_search — primary resolver.
  try {
    const who = [name, title && `(${title})`, company && `at ${company}`].filter(Boolean).join(" ");
    const result = await callClaudeWithTools<ClaudeResolution>({
      systemPrompt:
        "You find the official personal LinkedIn profile URL for a specific person using web search. " +
        "You must identify the RIGHT person by reasoning over their headline, current role and company — " +
        "never return a profile you are not confident matches. Only return a real linkedin.com/in/ URL.",
      userPrompt: `Find the personal LinkedIn profile URL for: ${who}.

Search the web (e.g. "${name}" "${company || ""}" linkedin) and identify the exact person who currently works ${company ? `at ${company}` : "in this role"}${title ? ` as ${title}` : ""}.

Verify the person STILL holds this role: an old appointment/promotion press release is not proof of current tenure. Check their current LinkedIn headline and look for any "former"/departure/successor signals.

Respond ONLY with JSON:
{"linkedinUrl": "https://www.linkedin.com/in/...", "confidence": "high" | "low", "stillAtCompany": true | false, "why": "one sentence on how you matched this exact person and whether they are still in the role"}

Set "stillAtCompany" to false if the person has left or no longer holds this role${company ? ` at ${company}` : ""} (even if you found their correct profile). Set confidence to "low" if you are unsure it is the right person, multiple people share the name, or they are no longer in the role. The URL must be a real linkedin.com/in/ profile.`,
      maxSearchUses: 6,
    });

    const url = normalizeIn(result?.linkedinUrl);
    // Person left / no longer in role → not a valid CURRENT stakeholder.
    // Flag as departed so the orchestrator excludes them (no point asking the
    // user to confirm a URL for someone who is no longer at the company).
    if (result.stillAtCompany === false) {
      return { url, confidence: "low", via: "claude", reason: result.why, departed: true };
    }
    if (url && (result.confidence || "").toLowerCase() === "high") {
      return { url, confidence: "high", via: "claude", reason: result.why };
    }
    if (url) {
      // Claude found one but isn't confident — try Apify to corroborate.
      const cross = await tryApify(name, company);
      if (cross.url && normalizeIn(cross.url) === url) {
        return { url, confidence: "high", via: "claude", reason: result.why };
      }
      return { url, confidence: "low", via: "claude", reason: result.why };
    }
  } catch (err) {
    console.log(`[url-resolver] Claude resolution failed: ${err instanceof Error ? err.message : err}`);
  }

  // 2) Apify search company-filter — backup resolver.
  const apify = await tryApify(name, company);
  if (apify.url) {
    return { url: normalizeIn(apify.url), confidence: apify.confidence, via: "apify" };
  }

  return { url: null, confidence: "low", via: "none" };
}

async function tryApify(
  name: string,
  company?: string,
): Promise<{ url: string | null; confidence: "high" | "low" }> {
  try {
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const lastName = rest.join(" ");
    const r = await searchLinkedInUrl(firstName, lastName, company);
    return { url: r.url, confidence: r.confidence };
  } catch (err) {
    console.log(`[url-resolver] Apify search failed: ${err instanceof Error ? err.message : err}`);
    return { url: null, confidence: "low" };
  }
}
