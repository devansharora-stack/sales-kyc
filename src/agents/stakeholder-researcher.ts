/**
 * Stakeholder Researcher Agent — Phase 2 (Intelligence)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
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
  return callClaudeJSON<Stakeholder[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research key stakeholders and decision makers at: ${companyName}\n\nRespond ONLY with a JSON array matching the output schema.`,
  });
}
