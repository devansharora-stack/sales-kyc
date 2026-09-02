/**
 * Sales Intelligence Agent — Phase 3 (Synthesis)
 * Produces Opportunity Value + Sales Motion assessments.
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callReasoningJSON } from "@/lib/reasoning";
import type {
  SalesIntelligence,
  Stakeholder,
  SolutionMapping,
  GTMStrategy,
} from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/sales-intelligence.md"),
  "utf-8"
);

interface SalesIntelligenceInput {
  companyName: string;
  profile: {
    industry: string;
    revenue: string;
    employees: string;
    businessDescription: string;
  };
  solutionMappings: SolutionMapping[];
  gtm: GTMStrategy;
  stakeholders: Stakeholder[];
}

export async function runSalesIntelligence(input: SalesIntelligenceInput): Promise<SalesIntelligence> {
  const solutionSummary = (input.solutionMappings || []).map((s) => ({
    solution: s.solution,
    solutionName: s.solutionName,
    priority: s.priority,
    fitScore: s.fitScore,
    estimatedImpact: s.estimatedImpact,
  }));
  const gtmSummary = {
    entrySolution: input.gtm?.entrySolution,
    urgency: input.gtm?.urgency,
    brief: input.gtm?.brief,
    pilotStrategy: input.gtm?.pilotStrategy,
    expandPath: input.gtm?.expandPath,
  };
  const stakeholderSummary = (input.stakeholders || []).map((s) => ({
    name: s.name,
    title: s.title,
    tier: s.tier,
  }));

  return callReasoningJSON<SalesIntelligence>({
    agent: "sales-intelligence",
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Assess this company: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Solution mappings:
${JSON.stringify(solutionSummary, null, 2)}

GTM strategy:
${JSON.stringify(gtmSummary, null, 2)}

Stakeholders:
${JSON.stringify(stakeholderSummary, null, 2)}

Respond ONLY with the JSON object matching the output schema.`,
  });
}
