/**
 * Partner Landscape Agent — Phase 2 (Intelligence)
 * Uses Gemini Flash with Google Search grounding to map the company's current
 * vendors/partners and the Techolution opportunity (gap) for each.
 * This is the authoritative vendor source — techLandscape.knownVendors is
 * derived from its output downstream (see orchestrator).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callGeminiGrounded } from "@/lib/gemini";
import type { PartnerEntry, TechLandscape } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/partner-landscape.md"),
  "utf-8"
);

// Load offerings knowledge base — used to frame the "opportunity" gap column
const offeringsKB = readFileSync(
  join(process.cwd(), "src/data/offerings-kb.json"),
  "utf-8"
);

interface PartnerLandscapeInput {
  companyName: string;
  profile: {
    industry: string;
    subSector: string;
    businessDescription: string;
  };
  techLandscape: TechLandscape;
}

export async function runPartnerLandscape(input: PartnerLandscapeInput): Promise<PartnerEntry[]> {
  const seedVendors = input.techLandscape?.knownVendors?.value || [];
  const seedSystems = input.techLandscape?.knownSystems?.value || [];

  const { data } = await callGeminiGrounded<PartnerEntry[]>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Map the partner/vendor landscape for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Description: ${input.profile.businessDescription}

Seed candidates already detected (research these deeper, and find others):
- Vendors: ${seedVendors.length ? seedVendors.join(", ") : "none detected yet"}
- Systems: ${seedSystems.length ? seedSystems.join(", ") : "none detected yet"}

For every vendor/partner you cite, include the real URL where you found the relationship.

## Techolution Offerings Knowledge Base
Use the offerings below to judge what each incumbent vendor does NOT do that Techolution can.
Do NOT fabricate vendors or capabilities.

${offeringsKB}

Respond ONLY with a JSON array matching the output schema.`,
  });

  return Array.isArray(data) ? data : [];
}
