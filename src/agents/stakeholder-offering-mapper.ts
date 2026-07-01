/**
 * Stakeholder × Offering Mapper Agent — Phase 3 (Synthesis)
 * Uses Claude Opus. Builds a decision matrix of stakeholders (rows) × the
 * company's mapped offerings (columns): who sponsors/approves/blocks each
 * offering and how to approach them. Pure synthesis over upstream data —
 * no web access, so no sources.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import { ALL_SOLUTIONS } from "@/lib/types";
import { normalizeStakeholderName } from "@/lib/names";
import type {
  StakeholderOfferingMatrix,
  MatrixRow,
  Stakeholder,
  SolutionMapping,
  PainPoint,
  GTMStrategy,
  SolutionId,
  StakeholderIntelBrief,
} from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/stakeholder-offering-mapper.md"),
  "utf-8"
);

const offeringsKB = readFileSync(
  join(process.cwd(), "src/data/offerings-kb.json"),
  "utf-8"
);

interface StakeholderOfferingMapperInput {
  companyName: string;
  profile: {
    industry: string;
    subSector: string;
    businessDescription: string;
  };
  stakeholders: Stakeholder[];
  solutionMappings: SolutionMapping[];
  painPoints: PainPoint[];
  gtm: GTMStrategy;
  // Completed deep-research briefs, matched to stakeholders by name. When a
  // stakeholder has one, the mapper uses their verified priorities/pains and
  // engagement angle to sharpen that row instead of guessing from title alone.
  deepProfiles?: { name: string; intelBrief: StakeholderIntelBrief }[];
}

export async function runStakeholderOfferingMapper(
  input: StakeholderOfferingMapperInput
): Promise<StakeholderOfferingMatrix> {
  const stakeholders = input.stakeholders || [];
  const mappings = input.solutionMappings || [];

  // Build the column set from the company's mapped solutions (dedup by id).
  const seen = new Set<SolutionId>();
  const solutionColumns: StakeholderOfferingMatrix["solutionColumns"] = [];
  for (const m of mappings) {
    if (!m.solution || seen.has(m.solution)) continue;
    seen.add(m.solution);
    const known = ALL_SOLUTIONS.find((s) => s.id === m.solution);
    solutionColumns.push({
      id: m.solution,
      name: m.solutionName || known?.name || m.solution,
      shortName: known?.shortName || m.solutionName || m.solution,
    });
  }

  // Nothing to map against — return an empty-but-valid matrix.
  if (stakeholders.length === 0 || solutionColumns.length === 0) {
    return { solutionColumns, rows: [] };
  }

  const deepByName = new Map(
    (input.deepProfiles || []).map((d) => [normalizeStakeholderName(d.name), d.intelBrief]),
  );

  const stakeholderSummary = stakeholders.map((s) => {
    const base = { name: s.name, title: s.title, tier: s.tier, relevance: s.relevance };
    const brief = deepByName.get(normalizeStakeholderName(s.name));
    if (!brief) return base;
    // Condense the deep brief to the fields that sharpen a matrix cell.
    return {
      ...base,
      deepIntel: {
        summary: brief.executiveSummary,
        priorities: (brief.verifiedPriorities || []).slice(0, 4).map((p) => p.priority),
        painPoints: (brief.painPoints || []).slice(0, 4).map((p) => p.pain),
        openingAngle: brief.engagementApproach?.openingAngle,
        talkingPoints: brief.engagementApproach?.talkingPoints,
      },
    };
  });
  const columnSummary = solutionColumns.map((c) => ({ id: c.id, name: c.name }));
  const painSummary = (input.painPoints || []).map((p) => ({
    title: p.title,
    severity: p.severity,
  }));

  const parsed = await callClaudeJSON<{ rows: MatrixRow[] }>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Build the stakeholder × offering decision matrix for: ${input.companyName}

Company profile:
- Industry: ${input.profile.industry} / ${input.profile.subSector}
- Description: ${input.profile.businessDescription}

Stakeholders (these are the ROWS):
${JSON.stringify(stakeholderSummary, null, 2)}

Some stakeholders include a "deepIntel" block from verified deep research (LinkedIn-based). When present, ground that row's roles and rationale in their verified priorities, pain points and engagement angle — do NOT contradict it or fall back to title-only guessing.

Offering COLUMNS (use these exact ids/names, in this order, one cell per column per row):
${JSON.stringify(columnSummary, null, 2)}

Pain points (context):
${JSON.stringify(painSummary, null, 2)}

GTM brief (context):
${input.gtm?.brief || "N/A"}

## Techolution Offerings Knowledge Base
${offeringsKB}

Respond ONLY with a JSON object: { "rows": [...] } matching the output schema.`,
  });

  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

  // Normalize: guarantee every row has exactly one cell per column, in order.
  const normalizedRows: MatrixRow[] = rows.map((row) => {
    const cellBySolution = new Map(
      (row.cells || []).map((c) => [c.solution, c])
    );
    const cells = solutionColumns.map((col) => {
      const cell = cellBySolution.get(col.id);
      if (cell) {
        return {
          solution: col.id,
          solutionName: col.name,
          role: cell.role || "",
          strength: cell.strength || (cell.role ? "conditional" : "none"),
          rationale: cell.rationale || "",
        };
      }
      return { solution: col.id, solutionName: col.name, role: "", strength: "none" as const, rationale: "" };
    });
    return {
      stakeholderName: row.stakeholderName,
      title: row.title || "",
      powerLabel: row.powerLabel || "",
      cells,
      enriched: deepByName.has(normalizeStakeholderName(row.stakeholderName)),
    };
  });

  // Guarantee a row for EVERY input stakeholder — the LLM occasionally drops one
  // (typically a manually-added name it deems less relevant). Append any missing
  // stakeholder with empty cells so they always appear in the matrix.
  const presentNames = new Set(normalizedRows.map((r) => normalizeStakeholderName(r.stakeholderName)));
  for (const s of stakeholders) {
    const key = normalizeStakeholderName(s.name);
    if (presentNames.has(key)) continue;
    normalizedRows.push({
      stakeholderName: s.name,
      title: s.title || "",
      powerLabel: (s.tier || "").toUpperCase(),
      cells: solutionColumns.map((col) => ({
        solution: col.id,
        solutionName: col.name,
        role: "",
        strength: "none" as const,
        rationale: "",
      })),
      enriched: deepByName.has(key),
    });
  }

  return { solutionColumns, rows: normalizedRows };
}
