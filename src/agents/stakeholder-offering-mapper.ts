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
import type {
  StakeholderOfferingMatrix,
  MatrixRow,
  Stakeholder,
  SolutionMapping,
  PainPoint,
  GTMStrategy,
  SolutionId,
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

  const stakeholderSummary = stakeholders.map((s) => ({
    name: s.name,
    title: s.title,
    tier: s.tier,
    relevance: s.relevance,
  }));
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
    };
  });

  return { solutionColumns, rows: normalizedRows };
}
