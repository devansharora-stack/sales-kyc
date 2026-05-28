/**
 * Scoring Agent — Phase 3 (Synthesis)
 * Uses Claude Opus via Azure AI Foundry (falls back to Gemini).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type {
  Source,
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

  const scores = await callClaudeJSON<ScoreBreakdown>({
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

  // Inject upstream sources into score dimensions (the scoring LLM doesn't have URLs)
  type SourceLike = { sources?: Source[] };
  const take = (arr: SourceLike[], n = 3): Source[] =>
    arr.flatMap((a) => (a.sources || []).slice(0, 2)).slice(0, n);

  if (scores.budgetSignal && (!scores.budgetSignal.sources || scores.budgetSignal.sources.length === 0)) {
    scores.budgetSignal.sources = ((input.financialSignals?.sources || []) as Source[]).slice(0, 3);
  }
  if (scores.solutionFit && (!scores.solutionFit.sources || scores.solutionFit.sources.length === 0)) {
    scores.solutionFit.sources = take(input.solutionMappings || []);
  }
  if (scores.triggerRecency && (!scores.triggerRecency.sources || scores.triggerRecency.sources.length === 0)) {
    scores.triggerRecency.sources = take(input.triggers || []);
  }
  if (scores.aiMaturity && (!scores.aiMaturity.sources || scores.aiMaturity.sources.length === 0)) {
    const techSources = [
      ...(input.techLandscape?.knownAIDeployments?.sources || []),
      ...(input.techLandscape?.knownVendors?.sources || []),
    ];
    scores.aiMaturity.sources = techSources.slice(0, 3);
  }
  if (scores.geminiAlignment && (!scores.geminiAlignment.sources || scores.geminiAlignment.sources.length === 0)) {
    const geminiSources = [
      ...(input.techLandscape?.workspacePlatform?.sources || []),
      ...(input.techLandscape?.cloudProviders?.sources || []),
    ];
    scores.geminiAlignment.sources = geminiSources.slice(0, 3);
  }

  return scores;
}
