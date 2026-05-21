/**
 * Pain Point Analyzer Agent — Phase 2 (Intelligence)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type { PainPoint, TriggerEvent, TechLandscape } from "@/lib/types";
import type { FinancialSignalOutput } from "./financial-signal";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/pain-point-analyzer.md"),
  "utf-8"
);

interface PainPointInput {
  companyName: string;
  profile: {
    industry: string;
    subSector: string;
    revenue: string;
    employees: string;
    businessDescription: string;
  };
  triggers: TriggerEvent[];
  techLandscape: TechLandscape;
  financialSignals: FinancialSignalOutput;
}

export async function runPainPointAnalyzer(input: PainPointInput): Promise<PainPoint[]> {
  // Strip sources/URLs from intermediate data to keep prompt compact
  const triggerSummary = (input.triggers || []).map((t) => ({
    event: t.event, date: t.date, category: t.category, detail: t.detail, impact: t.impact,
  }));
  const techSummary = {
    cloudProviders: input.techLandscape?.cloudProviders?.value || [],
    workspacePlatform: input.techLandscape?.workspacePlatform?.value || "Unknown",
    knownAIDeployments: input.techLandscape?.knownAIDeployments?.value || [],
    knownVendors: input.techLandscape?.knownVendors?.value || [],
    knownSystems: input.techLandscape?.knownSystems?.value || [],
  };
  const finSummary = {
    budgetEvidence: input.financialSignals?.budgetEvidence || [],
    techInvestmentSignals: input.financialSignals?.techInvestmentSignals || [],
    costPressure: input.financialSignals?.costPressure || [],
  };

  return callClaudeJSON<PainPoint[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Analyze pain points for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Recent trigger events:
${JSON.stringify(triggerSummary, null, 2)}

Technology landscape:
${JSON.stringify(techSummary, null, 2)}

Financial signals:
${JSON.stringify(finSummary, null, 2)}

Respond ONLY with a JSON array matching the output schema.`,
  });
}
