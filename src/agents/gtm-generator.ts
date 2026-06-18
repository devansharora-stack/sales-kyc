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
  Source,
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
    sources: (t.sources || []).slice(0, 2).map((s) => ({ label: s.label, url: s.url, date: s.date, type: s.type })),
  }));
  const painSummary = (input.painPoints || []).map((p) => ({
    title: p.title, severity: p.severity, affectedFunctions: p.affectedFunctions,
    sources: (p.sources || []).slice(0, 2).map((s) => ({ label: s.label, url: s.url, date: s.date, type: s.type })),
  }));
  const solutionSummary = (input.solutionMappings || []).map((s) => ({
    solution: s.solution, solutionName: s.solutionName, painPoint: s.painPoint,
    priority: s.priority, proofPoint: s.proofPoint, estimatedImpact: s.estimatedImpact,
    sources: (s.sources || []).slice(0, 2).map((src) => ({ label: src.label, url: src.url, date: src.date, type: src.type })),
  }));
  const stakeholderSummary = (input.stakeholders || []).map((s) => ({
    name: s.name, title: s.title, tier: s.tier, relevance: s.relevance,
  }));

  const gtm = await callClaudeJSON<GTMStrategy>({
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

Respond ONLY with the JSON object matching the output schema. For per-section sources, reuse the source URLs provided in the input data. Do NOT fabricate URLs.`,
  });

  // Backfill any empty per-section sources from upstream grounded data
  const triggerSources: Source[] = (input.triggers || []).flatMap((t) => (t.sources || []).slice(0, 2));
  const finSources: Source[] = ((input.financialSignals?.sources as Source[]) || []).slice(0, 3);
  const solutionSources: Source[] = (input.solutionMappings || []).flatMap((s) => (s.sources || []).slice(0, 2));
  const techSources: Source[] = [
    ...(input.techLandscape?.cloudProviders?.sources || []),
    ...(input.techLandscape?.workspacePlatform?.sources || []),
    ...(input.techLandscape?.knownAIDeployments?.sources || []),
    ...(input.techLandscape?.knownVendors?.sources || []),
  ];

  // Validate and backfill: only keep sources that have real URLs from upstream
  const allUpstreamUrls = new Set<string>();
  for (const s of [...triggerSources, ...finSources, ...solutionSources, ...techSources]) {
    if (s.url) allUpstreamUrls.add(s.url);
  }

  // Strip any source Claude generated that doesn't exist in upstream data
  const filterValid = (sources: Source[] | undefined): Source[] =>
    (sources || []).filter((s) => s.url && allUpstreamUrls.has(s.url));

  gtm.sources = filterValid(gtm.sources);
  gtm.briefSources = filterValid(gtm.briefSources);
  gtm.entrySolutionSources = filterValid(gtm.entrySolutionSources);
  gtm.urgencySources = filterValid(gtm.urgencySources);
  gtm.competitiveSources = filterValid(gtm.competitiveSources);

  // Backfill empty sections
  if (!gtm.briefSources?.length) gtm.briefSources = [...triggerSources.slice(0, 2), ...finSources.slice(0, 1)];
  if (!gtm.entrySolutionSources?.length) gtm.entrySolutionSources = solutionSources.slice(0, 3);
  if (!gtm.urgencySources?.length) gtm.urgencySources = triggerSources.slice(0, 3);
  if (!gtm.competitiveSources?.length) gtm.competitiveSources = techSources.slice(0, 3);
  if (!gtm.sources?.length) gtm.sources = [...triggerSources.slice(0, 1), ...finSources.slice(0, 1), ...solutionSources.slice(0, 1)];

  return gtm;
}
