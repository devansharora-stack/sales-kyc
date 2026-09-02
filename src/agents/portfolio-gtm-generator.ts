/**
 * Portfolio-Rollup GTM Agent — project-level consolidated strategy.
 * Uses Claude Opus. Numbers, tiers, segments and committee tallies are computed
 * deterministically in portfolio-rollup.ts; this agent supplies the synthesis
 * prose, then we assemble the final PortfolioGTM so figures/accounts are always
 * the computed truth (the model cannot drift them).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callReasoningJSON } from "@/lib/reasoning";
import { buildPortfolioFacts, type PortfolioFacts, type AccountSummary } from "@/lib/portfolio-rollup";
import type { CompanyDetail, PortfolioGTM, PortfolioTier, PortfolioTierAccount } from "@/lib/types";

const systemPrompt = readFileSync(join(process.cwd(), "src/instructions/system-prompt.md"), "utf-8").replace(
  "{{DATE}}",
  new Date().toISOString().split("T")[0],
);
const agentPrompt = readFileSync(join(process.cwd(), "src/instructions/portfolio-gtm-generator.md"), "utf-8");
const offeringsKB = readFileSync(join(process.cwd(), "src/data/offerings-kb.json"), "utf-8");

interface PortfolioNarrative {
  thesis: string;
  theNumberCommentary: string;
  wedge: {
    universalPain: string;
    positioning: string;
    expansionPath: { offering: string; rationale: string }[];
  };
  accountWhyNow: Record<string, string>;
  tierCriteria: Record<string, string>;
  segments: { segment: string; accounts: string[]; play: string }[];
  buyingCommittee: { champion: string; economicBuyer: string; signOff: string; operationalEntry: string };
  actionPlan: { wave: string; focus: string; actions: string[] }[];
  dataQualityNotes: string[];
}

/** Compact per-account view handed to the model (no source URLs / heavy fields). */
function compactAccount(a: AccountSummary) {
  return {
    slug: a.slug,
    name: a.name,
    segment: a.subSector,
    totalScore: a.totalScore,
    rating: a.rating,
    urgency: a.urgency,
    geminiStatus: a.geminiStatus,
    entrySolution: a.entrySolution,
    opportunityScore: a.opportunityScore,
    estimatedFirstYear: a.estimatedFirstYear,
    estimatedExpansion: a.estimatedExpansion,
    salesMotion: a.salesMotion,
    cycleLength: a.cycleLength,
    freshestTrigger: a.freshestTrigger
      ? { event: a.freshestTrigger.event, date: a.freshestTrigger.date, ageDays: a.freshestTrigger.ageDays }
      : null,
    topPains: a.topPains,
    decisionMakers: a.decisionMakers,
    champions: a.champions,
    defaultTier: a.defaultTier,
  };
}

const TIER_LABELS: Record<1 | 2 | 3, string> = { 1: "Strike now", 2: "Near-term", 3: "Nurture / event-driven" };

function toTierAccount(a: AccountSummary, whyNow: string): PortfolioTierAccount {
  return {
    slug: a.slug,
    name: a.name,
    totalScore: a.totalScore,
    rating: a.rating,
    opportunityScore: a.opportunityScore,
    estimatedFirstYear: a.estimatedFirstYear || "—",
    whyNow: whyNow || a.freshestTrigger?.event || "",
  };
}

/** Assemble the final PortfolioGTM: computed facts for numbers/accounts, LLM prose for narrative. */
function assemble(facts: PortfolioFacts, n: PortfolioNarrative): PortfolioGTM {
  const knownNames = new Set(facts.accounts.map((a) => a.name));
  const byTier = (t: 1 | 2 | 3): PortfolioTier => ({
    tier: t,
    label: TIER_LABELS[t],
    criteria: n.tierCriteria?.[String(t)] || "",
    accounts: facts.accounts
      .filter((a) => a.defaultTier === t)
      .sort((x, y) => y.strikeScore - x.strikeScore)
      .map((a) => toTierAccount(a, n.accountWhyNow?.[a.slug] || "")),
  });

  const top = facts.topEntryMotion;
  const sharedEntryMotion = top ? `${top.count} of ${facts.accountCount} lead with ${top.solution}` : "";

  const dataQualityNotes = [...(n.dataQualityNotes || []), ...facts.dataQualityFlags];

  return {
    projectName: facts.projectName,
    accountCount: facts.accountCount,
    generatedDate: new Date().toISOString().split("T")[0],
    thesis: n.thesis || "",
    theNumber: {
      aggregateFirstYear: facts.aggregateFirstYear,
      aggregateExpansion: facts.aggregateExpansion,
      sharedEntryMotion,
      commentary: n.theNumberCommentary || "",
    },
    wedge: {
      entrySolution: top?.solution || "",
      universalPain: n.wedge?.universalPain || "",
      positioning: n.wedge?.positioning || "",
      expansionPath: n.wedge?.expansionPath || [],
    },
    tiers: [byTier(1), byTier(2), byTier(3)],
    // Segments are an LLM synthesis judgment; keep only accounts that exist.
    segmentPlaybooks: (n.segments || [])
      .map((s) => ({
        segment: s.segment,
        accounts: (s.accounts || []).filter((name) => knownNames.has(name)),
        play: s.play || "",
      }))
      .filter((s) => s.accounts.length > 0),
    buyingCommittee: n.buyingCommittee || { champion: "", economicBuyer: "", signOff: "", operationalEntry: "" },
    actionPlan: n.actionPlan || [],
    dataQualityNotes,
  };
}

export async function runPortfolioGTMGenerator(projectName: string, companies: CompanyDetail[]): Promise<PortfolioGTM> {
  const facts = buildPortfolioFacts(projectName, companies);

  const narrative = await callReasoningJSON<PortfolioNarrative>({
    agent: "portfolio-gtm-generator",
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Consolidate a portfolio GTM strategy for the project "${projectName}" (${facts.accountCount} researched accounts).

## FACTS (computed — do not change these numbers)
- Aggregate estimated first-year opportunity (sum of per-account midpoints): ${facts.aggregateFirstYear}
- Aggregate estimated expansion potential: ${facts.aggregateExpansion}
- Entry-motion distribution: ${JSON.stringify(facts.entryMotionCounts)}
- Tier counts (by computed strike-rank): ${JSON.stringify(facts.tierCounts)}
- Raw sub-sector distribution (a hint only — define your own THEMATIC segments, don't reuse these labels): ${JSON.stringify(facts.segments.map((s) => `${s.segment} (${s.accounts.length})`))}
- Buying-committee role tally (# accounts with each role): ${JSON.stringify(facts.committeeRoleTally)}
- Objective data-quality flags: ${JSON.stringify(facts.dataQualityFlags)}

## PER-ACCOUNT SUMMARIES
Each account's "defaultTier" is the computed strike-tier — respect it when writing tier criteria and why-now lines.
${JSON.stringify(facts.accounts.map(compactAccount), null, 2)}

## Techolution Offerings Knowledge Base
Reference these real offerings, engagement models, and named-client proof points when naming the wedge and expansion path.
${offeringsKB}

Respond ONLY with the JSON object matching the schema in your instructions. Provide an accountWhyNow entry for every account slug above, and group the accounts into 4–6 thematic segments.`,
  });

  return assemble(facts, narrative);
}
