/**
 * Pain Point Analyzer Agent — Phase 2 (Intelligence)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type { PainPoint, TriggerEvent, TechLandscape, Source } from "@/lib/types";
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
  // Strip sources/URLs from intermediate data to keep prompt compact
  const triggerSummary = (input.triggers || []).map((t) => ({
    event: t.event, date: t.date, category: t.category, detail: t.detail, impact: t.impact,
  }));
  const techSummary = {
    cloudProviders: input.techLandscape?.cloudProviders?.value || [],
    workspacePlatform: input.techLandscape?.workspacePlatform?.value || "Unknown",
    knownAIDeployments: input.techLandscape?.knownAIDeployments?.value || [],
    knownVendors: input.techLandscape?.knownVendors?.value || [],
    knownSystems: input.techLandscape?.knownSystems?.value || [],
  };
  const finSummary = {
    budgetEvidence: input.financialSignals?.budgetEvidence || [],
    techInvestmentSignals: input.financialSignals?.techInvestmentSignals || [],
    costPressure: input.financialSignals?.costPressure || [],
  };

  const painPoints = await callClaudeJSON<PainPoint[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Analyze pain points for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Revenue: ${input.profile.revenue}
- Employees: ${input.profile.employees}
- Description: ${input.profile.businessDescription}

Recent trigger events:
${JSON.stringify(triggerSummary, null, 2)}

Technology landscape:
${JSON.stringify(techSummary, null, 2)}

Financial signals:
${JSON.stringify(finSummary, null, 2)}

Respond ONLY with a JSON array matching the output schema. Set sources to an empty array — sources will be injected programmatically.`,
  });

  // Inject REAL sources from upstream grounded data (Claude has no web access)
  const allUpstreamSources: Source[] = [];
  for (const t of input.triggers || []) {
    for (const s of t.sources || []) if (s.url) allUpstreamSources.push(s);
  }
  for (const s of (input.financialSignals?.sources as Source[]) || []) {
    if (s.url) allUpstreamSources.push(s);
  }
  const tl = input.techLandscape;
  if (tl) {
    for (const field of [tl.cloudProviders, tl.workspacePlatform, tl.knownAIDeployments, tl.knownVendors, tl.knownSystems]) {
      for (const s of field?.sources || []) if (s.url) allUpstreamSources.push(s);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueSources = allUpstreamSources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  // For each pain point, find the most relevant upstream sources by keyword matching
  for (const pp of painPoints) {
    const keywords = (pp.title + " " + pp.description).toLowerCase().split(/\s+/);
    const scored = uniqueSources.map((src) => {
      const srcText = (src.label || "").toLowerCase();
      const matches = keywords.filter((kw) => kw.length > 3 && srcText.includes(kw)).length;
      return { src, matches };
    });
    scored.sort((a, b) => b.matches - a.matches);
    // Take top 3 matching sources; if none match, take the first 2 general sources
    const matched = scored.filter((s) => s.matches > 0).slice(0, 3).map((s) => s.src);
    pp.sources = matched.length > 0 ? matched : uniqueSources.slice(0, 2);
  }

  return painPoints;
}
