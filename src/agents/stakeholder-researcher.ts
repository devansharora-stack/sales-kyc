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

export async function runStakeholderResearcher(companyName: string): Promise<Stakeholder[]> {
  const { data, groundingSources } = await callGeminiGrounded<Stakeholder[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research key stakeholders and decision makers at: ${companyName}

Search for REAL executives:
1. "${companyName} leadership team" — company website leadership page (prefer the CURRENT page over cached/old articles)
2. "${companyName} CTO CIO CDO CISO" — technology leadership
3. "${companyName} CEO CFO COO" — C-suite
4. "${companyName} VP technology engineering" — senior tech leaders
5. "${companyName} executive appointment 2025 2026" — recent leadership changes
6. For EACH candidate you find, run a currency check before including them: "{name} ${companyName} current role 2026", "{name} left OR departed OR former ${companyName}", and confirm their LinkedIn/current headline still names ${companyName}.

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
