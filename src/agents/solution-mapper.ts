/**
 * Solution Mapper Agent — Phase 3 (Synthesis)
 * Uses Claude Opus for reasoning. Injects real Techolution offerings
 * knowledge base so proof points reference named clients only.
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

// Load offerings knowledge base — real case studies with named clients
const offeringsKB = readFileSync(
  join(process.cwd(), "src/data/offerings-kb.json"),
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
  // Strip sources/URLs from intermediate data to keep prompt compact
  const painSummary = (input.painPoints || []).map((p) => ({
    title: p.title, description: p.description, severity: p.severity,
    affectedFunctions: p.affectedFunctions, techolutionSolutions: p.techolutionSolutions,
  }));
  const techSummary = {
    cloudProviders: input.techLandscape?.cloudProviders?.value || [],
    workspacePlatform: input.techLandscape?.workspacePlatform?.value || "Unknown",
    knownAIDeployments: input.techLandscape?.knownAIDeployments?.value || [],
    knownVendors: input.techLandscape?.knownVendors?.value || [],
  };
  const finSummary = {
    budgetEvidence: input.financialSignals?.budgetEvidence || [],
    techInvestmentSignals: input.financialSignals?.techInvestmentSignals || [],
  };
  const triggerSummary = (input.triggers || []).map((t) => ({
    event: t.event, date: t.date, category: t.category, impact: t.impact,
  }));

  return callClaudeJSON<SolutionMapping[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Create solution mappings for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Pain points:
${JSON.stringify(painSummary, null, 2)}

Technology landscape:
${JSON.stringify(techSummary, null, 2)}

Financial signals:
${JSON.stringify(finSummary, null, 2)}

Trigger events:
${JSON.stringify(triggerSummary, null, 2)}

## Techolution Offerings Knowledge Base
Use ONLY the offerings and case studies below. Every proof point MUST reference a named client from this knowledge base. Do NOT fabricate proof points.

${offeringsKB}

Respond ONLY with a JSON array matching the output schema.`,
  });
}
