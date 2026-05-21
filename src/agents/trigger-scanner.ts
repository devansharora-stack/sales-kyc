/**
 * Trigger Scanner Agent — Phase 2 (Intelligence)
 * Uses Gemini Flash with Google Search grounding for research.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callGeminiGrounded } from "@/lib/gemini";
import type { TriggerEvent } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/trigger-scanner.md"),
  "utf-8"
);

interface TriggerScannerInput {
  companyName: string;
  profile: {
    industry: string;
    revenue: string;
    employees: string;
    businessDescription: string;
  };
}

export async function runTriggerScanner({ companyName, profile }: TriggerScannerInput): Promise<TriggerEvent[]> {
  const { data } = await callGeminiGrounded<TriggerEvent[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research recent trigger events for: ${companyName}

Company context:
- Industry: ${profile.industry}
- Revenue: ${profile.revenue}
- Employees: ${profile.employees}
- Description: ${profile.businessDescription}

Search for real recent events:
1. "${companyName} news 2025 2026" — recent headlines
2. "${companyName} CEO CTO leadership change" — executive moves
3. "${companyName} acquisition merger" — M&A activity
4. "${companyName} digital transformation AI" — tech initiatives
5. "${companyName} earnings revenue" — financial pressure signals
6. "${companyName} layoffs restructuring" — workforce changes
7. "${companyName} contract partnership" — new deals

For every source you cite, include the URL where you found the information.

Respond ONLY with a JSON array matching the output schema.`,
  });
  return data;
}
