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
    solution: s.solution, solutionName: s.solutionName, priority: s.priority,
    fitScore: s.fitScore, estimatedImpact: s.estimatedImpact,
  }));
  const gtmSummary = {
    entrySolution: input.gtm?.entrySolution, urgency: input.gtm?.urgency,
    brief: input.gtm?.brief,
  };
  const stakeholderSummary = (input.stakeholders || []).map((s) => ({
    name: s.name, title: s.title, tier: s.tier,
  }));

  return callClaudeJSON<ScoreBreakdown>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Score this company: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry}
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

GTM strategy:
${JSON.stringify(gtmSummary, null, 2)}

Stakeholders:
${JSON.stringify(stakeholderSummary, null, 2)}

Respond ONLY with the JSON object matching the output schema.`,
  });
}
