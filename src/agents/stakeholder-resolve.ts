/**
 * Stakeholder resolution — credit-minimal, quality-first.
 *
 * Two FREE layers, merged, then a PAID Lusha last-resort only when the free
 * layers surface no Decision Maker (rare):
 *
 *   1. Lusha `decision-makers`  (0 credits)  — operational/buying-committee
 *      people (Directors/Managers/some VPs) with real LinkedIn URLs.
 *   2. Gemini researcher + `resolveLinkedInUrl` (0 Lusha credits) — the C-suite
 *      by name, with LinkedIn resolved via Claude web_search (proven on CMS
 *      Energy to match/beat Lusha).
 *
 * Merge + dedupe → operational + C-suite, LinkedIn on everyone, ~0 credits.
 * Only if neither free layer yields a Decision Maker do we spend the ~3-4
 * credits on Lusha prospecting for the founder/C-suite.
 */

import type { Stakeholder } from "@/lib/types";
import { getDecisionMakers, getProspectingStakeholders } from "@/lib/lusha";
import { runStakeholderResearcher } from "./stakeholder-researcher";
import { resolveLinkedInUrl } from "./linkedin-url-resolver";

const LINKEDIN_IN_RE = /linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i;
const CONF_RANK: Record<Stakeholder["confidence"], number> = { verified: 3, likely: 2, unverified: 1 };

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
const inSlug = (url: string | undefined) => (url?.match(LINKEDIN_IN_RE)?.[1] || "").toLowerCase().replace(/\/$/, "");
const hasLinkedIn = (s: Stakeholder) => !!inSlug(s.sourceUrl);

/** On a duplicate, keep the entry with a real LinkedIn URL, then the higher confidence. */
function pickBetter(a: Stakeholder, b: Stakeholder): Stakeholder {
  if (hasLinkedIn(a) !== hasLinkedIn(b)) return hasLinkedIn(a) ? a : b;
  return (CONF_RANK[a.confidence] ?? 0) >= (CONF_RANK[b.confidence] ?? 0) ? a : b;
}

/**
 * Merge + dedupe across sources. Two people collapse when they share a
 * LinkedIn /in/ slug (catches name-order swaps + company suffixes, e.g.
 * "Shah Kanhai" vs "Kanhai Shah", "Kalyan Varma Almabase" vs "Kalyan Varma")
 * OR an identical normalized name.
 */
function mergeStakeholders(...lists: Stakeholder[][]): Stakeholder[] {
  const result: Stakeholder[] = [];
  const bySlug = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const list of lists) {
    for (const s of list) {
      if (!s?.name) continue;
      const slug = inSlug(s.sourceUrl);
      const nk = nameKey(s.name);
      let idx: number | undefined;
      if (slug && bySlug.has(slug)) idx = bySlug.get(slug);
      else if (byName.has(nk)) idx = byName.get(nk);
      if (idx === undefined) {
        idx = result.length;
        result.push(s);
      } else {
        result[idx] = pickBetter(result[idx], s);
      }
      if (slug) bySlug.set(slug, idx);
      byName.set(nk, idx);
    }
  }
  return result;
}

/**
 * Give every non-Lusha stakeholder a real LinkedIn URL via the resolver.
 * Drops people the resolver flags as departed; marks unresolvable people
 * unverified (kept, but with no broken link) instead of leaving a bad source.
 */
async function enrichWithLinkedIn(list: Stakeholder[], companyName: string): Promise<Stakeholder[]> {
  const resolved = await Promise.all(
    list.map(async (s): Promise<Stakeholder | null> => {
      if (s.source === "Lusha" || hasLinkedIn(s)) return s;
      const r = await resolveLinkedInUrl(s.name, companyName, s.title);
      if (r.departed) return null;
      if (r.url) {
        return { ...s, sourceUrl: r.url, confidence: r.confidence === "high" ? "verified" : "likely" };
      }
      return { ...s, sourceUrl: "", confidence: "unverified" };
    }),
  );
  return resolved.filter((s): s is Stakeholder => s !== null);
}

export async function resolveStakeholders(companyName: string, domain: string): Promise<Stakeholder[]> {
  // Free layer 1 — Lusha decision-makers (0 credits).
  const lushaFree = domain ? await getDecisionMakers(domain) : [];

  // Free layer 2 — Gemini researcher (0 Lusha credits), targets the C-suite.
  let gemini: Stakeholder[] = [];
  try {
    gemini = await runStakeholderResearcher(companyName);
  } catch (err) {
    console.log(`[stakeholders] gemini researcher failed: ${err instanceof Error ? err.message : err}`);
  }

  // Resolve LinkedIn for the Gemini people FIRST so dedup can collapse them
  // against Lusha entries by /in/ slug, then merge (Lusha wins dupes).
  const geminiEnriched = await enrichWithLinkedIn(gemini, companyName);
  let merged = mergeStakeholders(lushaFree, geminiEnriched);

  // Paid last resort — only when the free layers produced NO Decision Maker.
  if (!merged.some((s) => s.tier === "Decision Maker")) {
    const prospected = await getProspectingStakeholders(domain, companyName, 4);
    if (prospected.length) merged = mergeStakeholders(merged, prospected);
  }

  console.log(
    `[stakeholders] ${companyName}: ${merged.length} total ` +
      `(lusha-free ${lushaFree.length}, gemini ${gemini.length}, ` +
      `DM ${merged.filter((s) => s.tier === "Decision Maker").length})`,
  );
  return merged;
}
