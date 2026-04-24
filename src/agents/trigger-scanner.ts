/**
 * Trigger Scanner Agent — Phase 2 (Intelligence)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
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
  return callClaudeJSON<TriggerEvent[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research recent trigger events for: ${companyName}

Company context:
- Industry: ${profile.industry}
- Revenue: ${profile.revenue}
- Employees: ${profile.employees}
- Description: ${profile.businessDescription}

Respond ONLY with a JSON array matching the output schema.`,
  });
}
