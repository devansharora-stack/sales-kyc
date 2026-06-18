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
1. "${companyName} leadership team" — company website leadership page
2. "${companyName} CTO CIO CDO CISO" — technology leadership
3. "${companyName} CEO CFO COO" — C-suite
4. "${companyName} VP technology engineering" — senior tech leaders
5. "${companyName} executive appointment" — recent leadership changes

CRITICAL: Only include people whose name and title you found on a real page. Do NOT guess names. For each stakeholder, set sourceUrl to the actual page where you found their name and title.

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
