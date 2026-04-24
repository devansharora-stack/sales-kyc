/**
 * Scoring Agent — Phase 3 (Synthesis)
 * Uses Claude Opus via Azure AI Foundry (falls back to Gemini).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type {
  ScoreBreakdown,
  TechLandscape,
  TriggerEvent,
  PainPoint,
  SolutionMapping,
  GTMStrategy,
  Stakeholder,
} from "@/lib/types";
import type { FinancialSignalOutput } from "./financial-signal";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/scoring-agent.md"),
  "utf-8"
);

interface ScoringInput {
  companyName: string;
  profile: {
    industry: string;
    revenue: string;
    employees: string;
    businessDescription: string;
  };
  techLandscape: TechLandscape;
  financialSignals: FinancialSignalOutput;
  triggers: TriggerEvent[];
  painPoints: PainPoint[];
  solutionMappings: SolutionMapping[];
  gtm: GTMStrategy;
  stakeholders: Stakeholder[];
}

export async function runScoringAgent(input: ScoringInput): Promise<ScoreBreakdown> {
  return callClaudeJSON<ScoreBreakdown>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Score this company: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Technology landscape:
${JSON.stringify(input.techLandscape, null, 2)}

Financial signals:
${JSON.stringify(input.financialSignals, null, 2)}

Trigger events:
${JSON.stringify(input.triggers, null, 2)}

Pain points:
${JSON.stringify(input.painPoints, null, 2)}

Solution mappings:
${JSON.stringify(input.solutionMappings, null, 2)}

GTM strategy:
${JSON.stringify(input.gtm, null, 2)}

Stakeholders:
${JSON.stringify(input.stakeholders, null, 2)}

Respond ONLY with the JSON object matching the output schema.`,
  });
}
