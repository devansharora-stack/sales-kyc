/**
 * Financial Signal Agent — Phase 1 (Foundation)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/financial-signal.md"),
  "utf-8"
);

export interface FinancialSignalOutput {
  budgetEvidence: string[];
  techInvestmentSignals: string[];
  recentFundingOrCapex: string[];
  costPressure: string[];
  aiJobCount: string;
  sources: { label: string; url: string; date: string; type: string }[];
}

export async function runFinancialSignal(companyName: string): Promise<FinancialSignalOutput> {
  return callClaudeJSON<FinancialSignalOutput>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research financial signals and technology investment evidence for: ${companyName}\n\nRespond ONLY with the JSON object matching the output schema.`,
  });
}
