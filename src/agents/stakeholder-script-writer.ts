/**
 * Stakeholder Script Writer
 *
 * Takes one deep stakeholder profile + the offering to pitch (auto-picked from
 * the company match) and asks Claude to write three persona-tone variants of a
 * ~5-minute elevator-pitch conversation grounded in this person's real intel.
 *
 * Each tone is generated in its OWN call (run in parallel) so every script has
 * room to be long, natural, and discovery-heavy instead of a compressed pitch.
 * A separate lightweight call predicts the person's most likely disposition.
 * Degrades gracefully on thin input; normalizes defensively so the UI never
 * crashes.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type {
  DeepStakeholderProfile,
  ScriptTone,
  StakeholderScript,
  StakeholderScriptSet,
} from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/stakeholder-script-writer.md"),
  "utf-8",
);

const TONES: ScriptTone[] = ["receptive", "analytical", "skeptical"];
const TONE_LABELS: Record<ScriptTone, string> = {
  receptive: "The Open Book",
  analytical: "The Neutral Professional",
  skeptical: "The Defensive Guard",
};

export interface ScriptOffering {
  id: string;
  name: string;
  description?: string;
  startingPrice?: string | null;
  targetProfiles?: string[];
  caseStudies?: { client: string; engagement?: string; outcome?: string }[];
  // Company-specific match (from SolutionMapping), when available
  matchedValue?: string;
  matchedProofPoint?: { client: string; relevance: string; outcome: string };
  matchedPainPoint?: string;
}

export interface ScriptWriterInput {
  profile: DeepStakeholderProfile;
  offering: ScriptOffering;
  companyName: string;
  industry?: string;
  /** Optional rep guidance to steer generation, honored within the rules. */
  customInstruction?: string;
}

// Trim the profile to what matters for scripting (avoid dumping huge blobs).
function buildStakeholderPayload(input: ScriptWriterInput) {
  const { profile: p, offering, companyName, industry } = input;
  const brief = p.intelBrief;
  return {
    stakeholder: {
      fullName: p.fullName,
      headline: p.headline,
      currentRole: p.experience?.[0]
        ? { position: p.experience[0].position, company: p.experience[0].company }
        : undefined,
      company: companyName,
      industry,
      about: p.about,
      recentExperience: (p.experience || []).slice(0, 3).map((e) => ({
        position: e.position,
        company: e.company,
        duration: e.duration,
      })),
      executiveSummary: brief?.executiveSummary,
      keyInsight: brief?.keyInsight,
      verifiedPriorities: brief?.verifiedPriorities,
      painPoints: brief?.painPoints,
      postInsights: (brief?.postInsights || []).slice(0, 4),
      engagementApproach: brief?.engagementApproach,
    },
    offeringToPitch: offering,
  };
}

async function writeOneScript(
  input: ScriptWriterInput,
  tone: ScriptTone,
  payload: ReturnType<typeof buildStakeholderPayload>,
): Promise<StakeholderScript> {
  const custom = input.customInstruction?.trim()
    ? `\n\nRep guidance for this generation (honor it, but never break the non-negotiable rules): ${input.customInstruction.trim()}`
    : "";

  const script = await callClaudeJSON<Partial<StakeholderScript>>({
    systemPrompt,
    userPrompt:
      `Write the ONE "${tone}" (${TONE_LABELS[tone]}) elevator-pitch script for this stakeholder, ` +
      `pitching the offering provided. Ground every beat in this person's real profile and this ` +
      `company. Make it long, natural, and discovery-heavy — the prospect should be doing most of ` +
      `the talking. Respond with ONLY the single-script JSON object from your output schema.` +
      custom +
      `\n\n${JSON.stringify(payload, null, 2)}`,
  });

  return normalizeScript(script, tone);
}

interface TonePrediction {
  predictedTone?: ScriptTone;
  predictedToneReason?: string;
}

async function predictTone(
  payload: ReturnType<typeof buildStakeholderPayload>,
): Promise<TonePrediction> {
  try {
    return await callClaudeJSON<TonePrediction>({
      systemPrompt:
        `You assess how a specific B2B buyer is most likely to show up in a first sales ` +
        `conversation, from their profile (headline, seniority, function, post sentiment, ` +
        `priorities). Choose exactly one of three dispositions:\n` +
        `- "receptive": an operator with an urgent mandate, venting, eager — talks freely.\n` +
        `- "analytical": a technical/quant leader — terse, guarded, methodology-driven.\n` +
        `- "skeptical": built their own program and/or burned by vendors — protective, ego/political risk.\n` +
        `CFOs/procurement-minded lean skeptical or analytical; technical leaders lean analytical; ` +
        `operators under a deadline lean receptive. Respond with ONLY JSON: ` +
        `{"predictedTone":"...","predictedToneReason":"one line citing evidence from the profile"}.`,
      userPrompt: `Assess this stakeholder.\n\n${JSON.stringify(payload.stakeholder, null, 2)}`,
    });
  } catch {
    return {};
  }
}

export async function writeStakeholderScripts(
  input: ScriptWriterInput,
): Promise<StakeholderScriptSet> {
  const payload = buildStakeholderPayload(input);

  const [prediction, ...variants] = await Promise.all([
    predictTone(payload),
    ...TONES.map((tone) => writeOneScript(input, tone, payload)),
  ]);

  const predictedTone: ScriptTone = TONES.includes(prediction.predictedTone as ScriptTone)
    ? (prediction.predictedTone as ScriptTone)
    : "analytical";

  return {
    offeringId: input.offering.id,
    offeringName: input.offering.name,
    predictedTone,
    predictedToneReason: prediction.predictedToneReason || "",
    generatedAt: new Date().toISOString(),
    variants,
  };
}

// Defensive: guarantee a well-formed script with no missing arrays.
function normalizeScript(v: Partial<StakeholderScript>, tone: ScriptTone): StakeholderScript {
  return {
    tone,
    toneLabel: v?.toneLabel || TONE_LABELS[tone],
    scenario: v?.scenario || "",
    lines: Array.isArray(v?.lines)
      ? v.lines.filter((l) => l && typeof l.text === "string" && l.text.trim().length > 0)
      : [],
    objections: Array.isArray(v?.objections)
      ? v.objections.filter((o) => o && o.objection && o.response)
      : [],
    leaveBehind: v?.leaveBehind || "",
  };
}
