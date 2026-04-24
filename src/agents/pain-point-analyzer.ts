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
  return callClaudeJSON<PainPoint[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Analyze pain points for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Recent trigger events:
${JSON.stringify(input.triggers, null, 2)}

Technology landscape:
${JSON.stringify(input.techLandscape, null, 2)}

Financial signals:
${JSON.stringify(input.financialSignals, null, 2)}

Respond ONLY with a JSON array matching the output schema.`,
  });
}
