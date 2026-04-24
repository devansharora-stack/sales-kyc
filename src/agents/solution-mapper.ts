/**
 * Solution Mapper Agent — Phase 3 (Synthesis)
 * Uses Claude Opus via Azure AI Foundry (falls back to Gemini).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type { SolutionMapping, PainPoint, TechLandscape, TriggerEvent } from "@/lib/types";
import type { FinancialSignalOutput } from "./financial-signal";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/solution-mapper.md"),
  "utf-8"
);

interface SolutionMapperInput {
  companyName: string;
  profile: {
    industry: string;
    subSector: string;
    revenue: string;
    employees: string;
    businessDescription: string;
  };
  painPoints: PainPoint[];
  techLandscape: TechLandscape;
  financialSignals: FinancialSignalOutput;
  triggers: TriggerEvent[];
}

export async function runSolutionMapper(input: SolutionMapperInput): Promise<SolutionMapping[]> {
  return callClaudeJSON<SolutionMapping[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Create solution mappings for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Pain points:
${JSON.stringify(input.painPoints, null, 2)}

Technology landscape:
${JSON.stringify(input.techLandscape, null, 2)}

Financial signals:
${JSON.stringify(input.financialSignals, null, 2)}

Trigger events:
${JSON.stringify(input.triggers, null, 2)}

Respond ONLY with a JSON array matching the output schema.`,
  });
}
