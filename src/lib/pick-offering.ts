/**
 * Picks which Techolution offering a stakeholder's scripts should pitch.
 *
 * Strategy: load the linked company's CompanyDetail, take the highest-fit
 * Primary solution mapping, and resolve it to the offerings knowledge base.
 * Falls back to the Value Finder entry offering when there's no company link
 * or no usable mappings.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyProfiles } from "@/db/schema";
import { ALL_SOLUTIONS } from "@/lib/types";
import type { CompanyDetail, SolutionId, SolutionMapping } from "@/lib/types";
import type { ScriptOffering } from "@/agents/stakeholder-script-writer";

const DEFAULT_OFFERING_ID = "bpa-value-finder";

interface KBOffering {
  id: string;
  subType?: string;
  category?: string;
  description?: string;
  startingPrice?: string | null;
  targetProfiles?: string[];
  caseStudies?: { client: string; engagement?: string; outcome?: string }[];
}

const offeringsKB: { offerings: KBOffering[] } = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/offerings-kb.json"), "utf-8"),
);

// Legacy SolutionIds that don't exist as KB ids → nearest current offering.
const LEGACY_TO_KB: Partial<Record<SolutionId, string>> = {
  "value-finder": "bpa-value-finder",
  "gemini-land": "ge-land-native",
  "gemini-expand": "ge-expand-agents",
  "contract-intelligence": "bpa-full",
  "scheduling-intelligence": "bpa-full",
  "contextual-search": "ge-expand-agents",
  "ai-voice-assistants": "bpa-full",
  "requirement-ai": "bpa-full",
};

function kbId(solution: SolutionId): string {
  if (offeringsKB.offerings.some((o) => o.id === solution)) return solution;
  return LEGACY_TO_KB[solution] || DEFAULT_OFFERING_ID;
}

function offeringName(id: string): string {
  const sol = ALL_SOLUTIONS.find((s) => s.id === id);
  if (sol) return sol.name;
  const kb = offeringsKB.offerings.find((o) => o.id === id);
  return kb?.subType || kb?.category || id;
}

function buildOffering(id: string, mapping?: SolutionMapping): ScriptOffering {
  const kb = offeringsKB.offerings.find((o) => o.id === id);
  return {
    id,
    name: offeringName(id),
    description: kb?.description,
    startingPrice: kb?.startingPrice ?? null,
    targetProfiles: kb?.targetProfiles,
    caseStudies: kb?.caseStudies,
    matchedValue: mapping?.value,
    matchedProofPoint: mapping?.proofPoint,
    matchedPainPoint: mapping?.painPoint,
  };
}

function pickMapping(mappings: SolutionMapping[]): SolutionMapping | undefined {
  if (!mappings?.length) return undefined;
  const ranked = [...mappings].sort((a, b) => {
    const pri = (m: SolutionMapping) =>
      m.priority === "Primary" ? 2 : m.priority === "Secondary" ? 1 : 0;
    if (pri(b) !== pri(a)) return pri(b) - pri(a);
    return (b.fitScore ?? 0) - (a.fitScore ?? 0);
  });
  return ranked[0];
}

export interface ResolvedOffering {
  offering: ScriptOffering;
  companyName: string;
  industry?: string;
}

export async function resolveScriptOffering(
  companyProfileId: string | null,
  fallbackCompanyName: string,
): Promise<ResolvedOffering> {
  if (companyProfileId) {
    const [row] = await db
      .select({ data: companyProfiles.data })
      .from(companyProfiles)
      .where(eq(companyProfiles.id, companyProfileId));
    const detail = row?.data as CompanyDetail | undefined;
    if (detail) {
      const mapping = pickMapping(detail.solutionMappings || []);
      const id = mapping ? kbId(mapping.solution) : DEFAULT_OFFERING_ID;
      return {
        offering: buildOffering(id, mapping),
        companyName: detail.name || fallbackCompanyName,
        industry: detail.industry,
      };
    }
  }

  return {
    offering: buildOffering(DEFAULT_OFFERING_ID),
    companyName: fallbackCompanyName,
  };
}
