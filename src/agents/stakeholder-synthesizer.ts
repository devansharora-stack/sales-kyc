/**
 * Stakeholder Synthesizer
 *
 * Takes the merged/normalized raw profile (incl. pre-filtered posts) and asks
 * Claude to produce an evidence-backed intelBrief. Degrades gracefully when
 * fields are missing. The raw profile is preserved separately by the caller;
 * this only produces the AI synthesis layer.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type { DeepStakeholderProfile, StakeholderIntelBrief } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/stakeholder-synthesizer.md"),
  "utf-8",
);

// What we feed the model — the raw profile minus the AI layers.
type RawProfile = Omit<DeepStakeholderProfile, "intelBrief" | "dataRichness">;

const EMPTY_BRIEF: StakeholderIntelBrief = {
  intelQuality: "LOW",
  intelQualityReason: "Synthesis unavailable.",
  executiveSummary: "",
  keyInsight: "",
  careerNarrative: [],
  verifiedPriorities: [],
  painPoints: [],
  postInsights: [],
  engagementApproach: { openingAngle: "", talkingPoints: [], avoidTopics: [] },
};

export async function synthesizeStakeholder(raw: RawProfile): Promise<StakeholderIntelBrief> {
  // Trim the payload to what matters for synthesis (avoid dumping huge raw blobs).
  const payload = {
    fullName: raw.fullName,
    headline: raw.headline,
    location: raw.location,
    about: raw.about,
    experience: raw.experience,
    skills: raw.skills,
    education: raw.education,
    certifications: raw.certifications,
    organizations: raw.organizations,
    honorsAndAwards: raw.honorsAndAwards,
    languages: raw.languages,
    companyIntel: raw.companyIntel,
    posts: (raw.posts || []).map((p) => ({
      text: p.text,
      date: p.date,
      engagement: `${p.likes ?? 0} likes, ${p.comments ?? 0} comments`,
      url: p.url,
    })),
  };

  try {
    const brief = await callClaudeJSON<StakeholderIntelBrief>({
      systemPrompt,
      userPrompt: `Here is the scraped LinkedIn data for one person. Synthesize the sales intelligence brief per your instructions.\n\n${JSON.stringify(payload, null, 2)}`,
      temperature: 0.3,
    });
    return normalizeBrief(brief);
  } catch (err) {
    console.log(`[synthesizer] Failed: ${err instanceof Error ? err.message : err}`);
    return EMPTY_BRIEF;
  }
}

// Defensive: ensure all arrays/objects exist so the UI never crashes.
function normalizeBrief(b: Partial<StakeholderIntelBrief>): StakeholderIntelBrief {
  const tier = b.tier === "Decision Maker" || b.tier === "Champion" || b.tier === "Influencer" ? b.tier : undefined;
  return {
    intelQuality: b.intelQuality || "LOW",
    intelQualityReason: b.intelQualityReason || "",
    ...(tier ? { tier } : {}),
    executiveSummary: b.executiveSummary || "",
    keyInsight: b.keyInsight || "",
    careerNarrative: Array.isArray(b.careerNarrative) ? b.careerNarrative : [],
    verifiedPriorities: Array.isArray(b.verifiedPriorities) ? b.verifiedPriorities : [],
    painPoints: Array.isArray(b.painPoints) ? b.painPoints : [],
    postInsights: Array.isArray(b.postInsights) ? b.postInsights : [],
    engagementApproach: {
      openingAngle: b.engagementApproach?.openingAngle || "",
      talkingPoints: Array.isArray(b.engagementApproach?.talkingPoints) ? b.engagementApproach!.talkingPoints : [],
      avoidTopics: Array.isArray(b.engagementApproach?.avoidTopics) ? b.engagementApproach!.avoidTopics : [],
    },
  };
}
