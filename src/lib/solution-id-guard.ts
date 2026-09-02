/**
 * SolutionId guard — provider-agnostic safety net for reasoning output.
 *
 * Reasoning agents must emit `SolutionId` values from a FIXED vocabulary
 * (see ALL_SOLUTIONS). Opus obeys it; other models (e.g. Luna) sometimes
 * invent descriptive slugs like "ai-vision-qa". An invalid id silently
 * breaks downstream keying (offering matrix, prep endpoint, UI columns).
 *
 * This walks parsed output, finds SolutionId-typed fields, and for any
 * invalid value tries to remap it to a real id by fuzzy-matching against
 * the canonical names/shortNames. Unmappable values are recorded and left
 * as-is (never nulled — a required field staying wrong is safer to surface
 * than to drop). Returns the list of offenders so the caller can log/alert.
 */

import { ALL_SOLUTIONS, type SolutionId } from "@/lib/types";

const VALID_IDS = new Set<string>(ALL_SOLUTIONS.map((s) => s.id));
// Also accept legacy ids that exist on the type but not in ALL_SOLUTIONS.
const LEGACY_IDS = [
  "contract-intelligence", "scheduling-intelligence", "contextual-search",
  "ai-voice-assistants", "gemini-land", "gemini-expand", "requirement-ai", "value-finder",
];
for (const id of LEGACY_IDS) VALID_IDS.add(id);

// Fields that hold a single SolutionId.
const SCALAR_FIELDS = new Set(["entrySolution", "solution"]);
// Fields that hold SolutionId[].
const ARRAY_FIELDS = new Set(["techolutionSolutions"]);
// Agents whose `solution` field is FREE PROSE, not a SolutionId — never guard it
// (value-finder-copy emits pains[].solution as a written description).
const PROSE_SOLUTION_AGENTS = new Set(["value-finder-copy"]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Best-effort remap of an invalid id to a real SolutionId via name/shortName. */
function remap(value: string): SolutionId | null {
  const v = norm(value);
  if (!v) return null;
  for (const s of ALL_SOLUTIONS) {
    if (norm(s.id) === v || norm(s.name) === v || norm(s.shortName) === v) return s.id;
  }
  // Loose contains match (e.g. "vision qa" → nothing here, but "cloud migration" → dev-cloud-migration)
  for (const s of ALL_SOLUTIONS) {
    const n = norm(s.name), sn = norm(s.shortName);
    if (v.includes(n) || n.includes(v) || v.includes(sn) || sn.includes(v)) return s.id;
  }
  // Stale-id backstop: models fluent in current Google product names "modernize"
  // our legacy ids by appending them (contextual-search → contextual-search-agentspace,
  // gemini-expand → gemini-enterprise-expand). Recover by progressively trimming
  // trailing hyphen tokens and re-checking every valid id (catalog + legacy).
  const tokens = value.toLowerCase().split("-").filter(Boolean);
  for (let end = tokens.length - 1; end >= 2; end--) {
    const candidate = tokens.slice(0, end).join("-");
    if (VALID_IDS.has(candidate)) return candidate as SolutionId;
  }
  return null;
}

export interface GuardResult {
  invalid: { field: string; value: string; remappedTo: string | null }[];
}

/** Mutates `obj` in place. Returns offenders found. */
export function sanitizeSolutionIds(obj: unknown, agent = "unknown"): GuardResult {
  const invalid: GuardResult["invalid"] = [];
  const guardSolutionScalar = !PROSE_SOLUTION_AGENTS.has(agent);

  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, val] of Object.entries(node)) {
      if (key === "solution" && !guardSolutionScalar) {
        walk(val);
      } else if (SCALAR_FIELDS.has(key) && typeof val === "string") {
        if (!VALID_IDS.has(val)) {
          const remapped = remap(val);
          invalid.push({ field: key, value: val, remappedTo: remapped });
          if (remapped) node[key] = remapped;
        }
      } else if (ARRAY_FIELDS.has(key) && Array.isArray(val)) {
        node[key] = val.map((v) => {
          if (typeof v === "string" && !VALID_IDS.has(v)) {
            const remapped = remap(v);
            invalid.push({ field: key, value: v, remappedTo: remapped });
            return remapped ?? v;
          }
          return v;
        });
      } else {
        walk(val);
      }
    }
  };

  walk(obj);

  if (invalid.length) {
    console.warn(
      `[solution-id-guard] ${agent}: ${invalid.length} invalid SolutionId(s): ` +
        invalid.map((i) => `${i.field}="${i.value}"→${i.remappedTo ?? "UNMAPPED"}`).join(", ")
    );
  }
  return { invalid };
}
