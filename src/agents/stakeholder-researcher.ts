/**
 * Stakeholder Researcher Agent — Phase 2 (Intelligence)
 * Uses Gemini Flash with Google Search grounding for research.
 * Grounding metadata provides verified URLs for each stakeholder.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callGeminiGrounded } from "@/lib/gemini";
import type { Stakeholder } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/stakeholder-researcher.md"),
  "utf-8"
);

export interface StakeholderResearchContext {
  /** The company's verified primary domain (e.g. "uti.edu"). Anchors identity so
   *  acronym/name collisions (e.g. "UTI" the trade school vs UTI the mutual fund)
   *  don't resolve to the wrong entity. */
  domain?: string;
  /** The company's industry/sector, a second disambiguation signal. */
  industry?: string;
}

export async function runStakeholderResearcher(
  companyName: string,
  ctx: StakeholderResearchContext = {},
): Promise<Stakeholder[]> {
  const { domain, industry } = ctx;
  // Build a hard identity anchor so an ambiguous name/acronym can't drift to a
  // different same-named company. Omitted cleanly when we have no domain.
  const idParts = [
    domain ? `official website ${domain}` : null,
    industry ? `${industry} sector` : null,
  ].filter(Boolean);
  const idLine = idParts.length ? ` (${idParts.join(", ")})` : "";
  const anchorBlock = domain
    ? `\n\nCRITICAL — COMPANY IDENTITY: The target is the specific company whose official website is ${domain}${industry ? `, operating in ${industry}` : ""}. Many companies share a name or acronym. You MUST only include people who currently work for THIS company (the one at ${domain}). REJECT anyone employed by a different, similarly-named organization — e.g. a mutual fund, bank, holding company, or a foreign entity that shares the name or acronym but is NOT ${domain}. If a candidate's employer, LinkedIn, or source page points to any domain or organization other than ${domain} (or an obvious sub-brand of it), OMIT them. A shorter, correct list beats a longer list polluted with the wrong company's people.`
    : "";

  const { data, groundingSources } = await callGeminiGrounded<Stakeholder[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research key stakeholders and decision makers at: ${companyName}${idLine}${anchorBlock}

Search for REAL executives:
1. "${companyName} leadership team"${domain ? ` site:${domain} OR "${domain}"` : ""} — company website leadership page (prefer the CURRENT page over cached/old articles)
2. "${companyName} CTO CIO CDO CISO" — technology leadership
3. "${companyName} CEO CFO COO" — C-suite
4. "${companyName} VP technology engineering" — senior tech leaders
5. "${companyName} executive appointment 2025 2026" — recent leadership changes
6. For EACH candidate you find, run a currency check before including them: "{name} ${companyName} current role 2026", "{name} left OR departed OR former ${companyName}", and confirm their LinkedIn/current headline still names ${companyName}${domain ? ` (the ${domain} company, not a same-named different firm)` : ""}.

CRITICAL: Only include people whose name and title you found on a real page AND who you can verify CURRENTLY hold that role at ${companyName} today. Do NOT guess names. For each stakeholder, set sourceUrl to the actual page where you found their name and title.

CRITICAL — CURRENCY: Exclude anyone who appears to have left ${companyName}, whose current employer is listed as a different company, or whose tenure looks ended (a successor was named, "former", they founded/joined another company). A press release announcing an appointment is a point-in-time fact, NOT proof of current tenure — do not rely on stale third-party listings. When you cannot confirm the person is CURRENTLY at ${companyName}, OMIT them rather than guess. A departed executive in the list is worse than a shorter list.

Respond ONLY with a JSON array matching the output schema.`,
  });

  // Mark stakeholders whose sourceUrl came from grounding as verified
  for (const stakeholder of data) {
    if ((stakeholder as any)._grounded === true) {
      (stakeholder as any).confidence = "verified";
    } else if ((stakeholder as any)._grounded === false) {
      (stakeholder as any).confidence = "unverified";
    }
  }

  console.log(`[stakeholder] Found ${data.length} stakeholders, ${groundingSources.length} grounding sources`);
  return data;
}
