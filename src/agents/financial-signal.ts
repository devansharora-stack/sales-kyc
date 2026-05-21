/**
 * Financial Signal Agent — Phase 1 (Foundation)
 * Uses Gemini Flash with Google Search grounding for research.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callGeminiGrounded } from "@/lib/gemini";

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
  const { data } = await callGeminiGrounded<FinancialSignalOutput>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research financial signals and technology investment evidence for: ${companyName}

Search for real financial data:
1. "${companyName} 10-K annual report 2025" or "${companyName} earnings"
2. "${companyName} technology investment" or "${companyName} digital transformation budget"
3. "${companyName} AI hiring" or "${companyName} AI job postings"
4. "${companyName} funding round" or "${companyName} capital expenditure"
5. SEC EDGAR filings if publicly traded

For every source you cite, include the URL where you found the information.

Respond ONLY with the JSON object matching the output schema.`,
  });
  return data;
}
