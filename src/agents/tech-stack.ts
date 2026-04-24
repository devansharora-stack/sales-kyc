/**
 * Tech Stack Agent — Phase 1 (Foundation)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type { TechLandscape } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/tech-stack.md"),
  "utf-8"
);

export async function runTechStack(companyName: string): Promise<TechLandscape> {
  return callClaudeJSON<TechLandscape>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research and produce the technology landscape for: ${companyName}\n\nRespond ONLY with the JSON object matching the output schema.`,
  });
}
