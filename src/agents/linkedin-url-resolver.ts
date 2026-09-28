/**
 * LinkedIn URL Resolver — tiered, cost-first.
 *
 * The old resolver hit Claude web_search (Opus) for EVERY stakeholder — the
 * single biggest cost in the pipeline (~$0.35/exec). Now a cheap path runs
 * first and Opus is a rare fallback:
 *
 *   TIER 1  Apify Google-SERP find  (~$0.004) — `"Name" Company site:linkedin.com/in`
 *           returns real /in/ candidates + snippet titles/descriptions.
 *   TIER 2  Luna pick+confirm        (~$0.001) — reads the ~10 candidates and
 *           picks the right person by matching name + (title|company) against
 *           the snippets. STRICT: allowed to answer "none" so we never store a
 *           wrong namesake for a person who simply has no findable profile.
 *   TIER 3  Claude web_search (Opus) — the original resolver, INTACT. Called
 *           ONLY when Luna is not confident (med/low) so it stays rare. Handles
 *           departed detection.
 *
 * Notes learnt the hard way:
 *  - Gemini grounding CANNOT return personal /in/ URLs — do NOT use it here.
 *  - SERP query must quote the NAME only (company unquoted); quoting the whole
 *    phrase returns junk.
 *
 * Env levers (safe rollback):
 *  - LINKEDIN_RESOLVER      = "tiered" (default) | "opus"  ("opus" = old behaviour)
 *  - LINKEDIN_ESCALATE_BELOW = "high" (default) | "med"    (when to fall to Opus)
 */

import { callClaudeWithTools } from "@/lib/claude";
import { callLunaJSON } from "@/lib/luna";
import { searchLinkedInUrl } from "@/lib/apify";
import { runWithUsageContext } from "@/lib/usage-context";

const LINKEDIN_IN_RE = /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i;

export interface ResolvedUrl {
  url: string | null;
  confidence: "high" | "low";
  via: "serp+luna" | "claude" | "apify" | "none";
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

/** One SERP candidate (real /in/ URL + Google snippet text for corroboration). */
interface SerpCandidate {
  url: string;
  title: string;
  description: string;
}

interface LunaPick {
  url?: string | null;
  confidence?: "high" | "med" | "none" | string;
  why?: string;
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
  // Tag every LLM call in here as the resolver so usage attributes correctly
  // (was inheriting the ambient "stakeholder_researcher" label).
  return runWithUsageContext({ agent: "linkedin_resolver" }, async () => {
    const mode = (process.env.LINKEDIN_RESOLVER || "tiered").toLowerCase();

    if (mode !== "opus") {
      // ── TIER 1: Apify SERP find ──
      let candidates: SerpCandidate[] = [];
      try {
        candidates = await serpFind(name, company);
      } catch (err) {
        console.log(`[url-resolver] SERP find failed: ${err instanceof Error ? err.message : err}`);
      }

      // ── TIER 2: Luna pick + confirm ──
      if (candidates.length > 0) {
        try {
          const pick = await lunaPick(name, candidates, company, title);
          const url = normalizeIn(pick.url);
          const conf = (pick.confidence || "").toLowerCase();

          if (conf === "high" && url) {
            return { url, confidence: "high", via: "serp+luna", reason: pick.why };
          }
          if (conf === "none") {
            // No candidate is plausibly this person — likely no findable profile.
            // Do NOT guess; store nothing rather than a wrong namesake.
            return { url: null, confidence: "low", via: "serp+luna", reason: pick.why };
          }
          // "med"/low → fall through to Opus (unless the escalation bar is "med").
          const escalateBelow = (process.env.LINKEDIN_ESCALATE_BELOW || "high").toLowerCase();
          if (escalateBelow === "med" && conf === "med" && url) {
            // Caller accepts med confidence without paying for Opus.
            return { url, confidence: "low", via: "serp+luna", reason: pick.why };
          }
        } catch (err) {
          console.log(`[url-resolver] Luna pick failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      // 0 candidates, SERP error, or Luna med/unsure → escalate to Opus below.
    }

    // ── TIER 3: Claude web_search (Opus) — original resolver, rare fallback ──
    return opusResolve(name, company, title);
  });
}

/**
 * TIER 1 — Apify Google-SERP scraper. Query quotes the NAME only (company
 * unquoted) and scopes to /in/ pages. Returns real candidates + snippet text.
 */
async function serpFind(name: string, company?: string): Promise<SerpCandidate[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not set");

  const query = `"${name}" ${company || ""} site:linkedin.com/in`.replace(/\s+/g, " ").trim();
  const url = `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: query,
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      countryCode: "us",
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Apify SERP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const items = (await res.json()) as Array<{ organicResults?: any[] }>;
  const organic = items?.[0]?.organicResults || [];
  const out: SerpCandidate[] = [];
  const seen = new Set<string>();
  for (const o of organic) {
    const u = normalizeIn(o?.url);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u, title: String(o?.title || ""), description: String(o?.description || "") });
  }
  return out;
}

/**
 * TIER 2 — Luna reads the SERP candidates and picks the right person, or says
 * "none". Cheap; allowed to reject so we never store a wrong namesake.
 */
async function lunaPick(
  name: string,
  candidates: SerpCandidate[],
  company?: string,
  title?: string,
): Promise<LunaPick> {
  const who = [name, title && `(${title})`, company && `at ${company}`].filter(Boolean).join(" ");
  const list = candidates
    .map((c, i) => `${i + 1}. ${c.url}\n   title: ${c.title}\n   snippet: ${c.description}`)
    .join("\n");

  return callLunaJSON<LunaPick>({
    effort: "low",
    systemPrompt:
      "You match a person to their real LinkedIn profile from a list of Google search results. " +
      "You must be strict: only pick a profile you are confident is the SAME person, judged by the " +
      "name plus their title/company as shown in the result title and snippet. If no result is " +
      "plausibly this person, you MUST answer none — never guess a namesake.",
    userPrompt: `Person to find: ${who}.

Candidate LinkedIn profiles (from Google):
${list}

Pick the ONE profile that is this exact person, or none.
Confidence rules — apply strictly:
- "high": the name matches AND the title OR company is corroborated by the result's title/snippet.
- "med": the name matches but nothing in the title/snippet corroborates their title or company.
- "none": no candidate is plausibly this person (e.g. all snippets show a different company/role, or only unrelated namesakes).

Respond ONLY with JSON:
{"url": "https://www.linkedin.com/in/..." or null, "confidence": "high" | "med" | "none", "why": "one sentence citing the snippet evidence"}

Set "url" to null when confidence is "none".`,
  });
}

/**
 * TIER 3 — original Claude web_search resolver (Opus). Unchanged logic; kept as
 * the confident-disambiguation fallback and it handles departure detection.
 */
async function opusResolve(name: string, company?: string, title?: string): Promise<ResolvedUrl> {
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

  // Last-ditch: Apify name search.
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
