/**
 * Solution Mapper Agent — Phase 3 (Synthesis)
 * Uses Claude Opus for reasoning. Injects real Techolution offerings
 * knowledge base so proof points reference named clients only.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callReasoningJSON } from "@/lib/reasoning";
import type { SolutionMapping, PainPoint, TechLandscape, TriggerEvent, Source } from "@/lib/types";
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

  const mappings = await callReasoningJSON<SolutionMapping[]>({
    agent: "solution-mapper",
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

Respond ONLY with a JSON array matching the output schema. Set sources to empty arrays — sources will be injected programmatically.`,
  });

  // Inject REAL sources from upstream grounded data (Claude has no web access)
  // Build a map of pain point title → sources for lookup
  const painSourceMap = new Map<string, Source[]>();
  for (const pp of input.painPoints || []) {
    painSourceMap.set(pp.title.toLowerCase(), pp.sources || []);
  }

  // Collect all upstream sources for general fallback
  const allUpstreamSources: Source[] = [];
  const seenUrls = new Set<string>();
  const addUnique = (sources: Source[] | undefined) => {
    for (const s of sources || []) {
      if (s.url && !seenUrls.has(s.url)) { seenUrls.add(s.url); allUpstreamSources.push(s); }
    }
  };
  for (const pp of input.painPoints || []) addUnique(pp.sources);
  for (const t of input.triggers || []) addUnique(t.sources);
  addUnique((input.financialSignals?.sources as Source[]) || []);
  const tl = input.techLandscape;
  if (tl) {
    for (const field of [tl.cloudProviders, tl.workspacePlatform, tl.knownAIDeployments, tl.knownVendors, tl.knownSystems]) {
      addUnique(field?.sources);
    }
  }

  for (const m of mappings) {
    // Match mapping to its pain point and inherit sources
    const ppSources = painSourceMap.get(m.painPoint?.toLowerCase()) || [];
    m.sources = ppSources.length > 0 ? ppSources.slice(0, 3) : allUpstreamSources.slice(0, 2);

    // estimatedImpact sources: use financial signal sources (budget evidence)
    if (m.estimatedImpact && typeof m.estimatedImpact === "object") {
      const finSources = ((input.financialSignals?.sources as Source[]) || []).slice(0, 2);
      m.estimatedImpact.sources = finSources.length > 0 ? finSources : allUpstreamSources.slice(0, 2);
    }
  }

  return mappings;
}
