/**
 * GTM Strategy Generator Agent — Phase 3 (Synthesis)
 * Uses Claude Opus. Includes offerings KB for realistic
 * pilot strategies and engagement model references.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type {
  GTMStrategy,
  TechLandscape,
  TriggerEvent,
  PainPoint,
  SolutionMapping,
  Stakeholder,
} from "@/lib/types";
import type { FinancialSignalOutput } from "./financial-signal";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/gtm-generator.md"),
  "utf-8"
);

// Load offerings KB for realistic pilot strategies and pricing references
const offeringsKB = readFileSync(
  join(process.cwd(), "src/data/offerings-kb.json"),
  "utf-8"
);

interface GTMGeneratorInput {
  companyName: string;
  profile: {
    industry: string;
    subSector: string;
    revenue: string;
    employees: string;
    hqCity: string;
    state: string;
    businessDescription: string;
  };
  techLandscape: TechLandscape;
  financialSignals: FinancialSignalOutput;
  triggers: TriggerEvent[];
  painPoints: PainPoint[];
  solutionMappings: SolutionMapping[];
  stakeholders: Stakeholder[];
}

export async function runGTMGenerator(input: GTMGeneratorInput): Promise<GTMStrategy> {
  // Strip sources/URLs from intermediate data to keep prompt compact
  const techSummary = {
    cloudProviders: input.techLandscape?.cloudProviders?.value || [],
    workspacePlatform: input.techLandscape?.workspacePlatform?.value || "Unknown",
    knownAIDeployments: input.techLandscape?.knownAIDeployments?.value || [],
    knownVendors: input.techLandscape?.knownVendors?.value || [],
  };
  const finSummary = {
    budgetEvidence: input.financialSignals?.budgetEvidence || [],
    techInvestmentSignals: input.financialSignals?.techInvestmentSignals || [],
    costPressure: input.financialSignals?.costPressure || [],
  };
  const triggerSummary = (input.triggers || []).map((t) => ({
    event: t.event, date: t.date, category: t.category, impact: t.impact,
  }));
  const painSummary = (input.painPoints || []).map((p) => ({
    title: p.title, severity: p.severity, affectedFunctions: p.affectedFunctions,
  }));
  const solutionSummary = (input.solutionMappings || []).map((s) => ({
    solution: s.solution, solutionName: s.solutionName, painPoint: s.painPoint,
    priority: s.priority, proofPoint: s.proofPoint, estimatedImpact: s.estimatedImpact,
  }));
  const stakeholderSummary = (input.stakeholders || []).map((s) => ({
    name: s.name, title: s.title, tier: s.tier, relevance: s.relevance,
  }));

  return callClaudeJSON<GTMStrategy>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Generate a go-to-market strategy for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- HQ: ${input.profile.hqCity}, ${input.profile.state}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Technology landscape:
${JSON.stringify(techSummary, null, 2)}

Financial signals:
${JSON.stringify(finSummary, null, 2)}

Trigger events:
${JSON.stringify(triggerSummary, null, 2)}

Pain points:
${JSON.stringify(painSummary, null, 2)}

Solution mappings:
${JSON.stringify(solutionSummary, null, 2)}

Stakeholders:
${JSON.stringify(stakeholderSummary, null, 2)}

## Techolution Offerings Knowledge Base
Reference these real offerings, engagement models, and pricing when building pilot strategies. Use named clients from case studies when mentioning proof points.

${offeringsKB}

Respond ONLY with the JSON object matching the output schema.`,
  });
}
