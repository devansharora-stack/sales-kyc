/**
 * Reasoning router — one entry point for the pipeline's reasoning/synthesis
 * agents, so the model behind each can be swapped by config without touching
 * agent code.
 *
 * Model resolution (first match wins):
 *   1. env  REASONING_MODEL__<agent>   (per-agent override, e.g. REASONING_MODEL__gtm_generator=luna)
 *   2. env  REASONING_MODEL            (global default for all reasoning agents)
 *   3. "opus"                          (hard default — zero behaviour change)
 *
 * Agent names are kebab-case (e.g. "gtm-generator"); the env override uses
 * the same name with '-' → '_' ("gtm_generator") since env keys can't hold '-'.
 *
 * Every routed call runs the SolutionId guard on the parsed output — a no-op
 * for compliant models (Opus), a safety net for ones that drift (Luna).
 */

import { callClaudeJSON } from "@/lib/claude";
import { callLunaJSON, type LunaEffort } from "@/lib/luna";
import { sanitizeSolutionIds } from "@/lib/solution-id-guard";

export type ReasoningModel = "opus" | "luna";

const VALID_EFFORTS: LunaEffort[] = ["none", "low", "medium", "high", "xhigh", "max"];

interface ReasoningOptions {
  agent: string;
  systemPrompt: string;
  userPrompt: string;
  /** Opus-only hint; ignored by providers that reject it (current Opus + Luna). */
  temperature?: number;
}

function resolveModel(agent: string): ReasoningModel {
  const envKey = "REASONING_MODEL__" + agent.replace(/-/g, "_");
  const perAgent = process.env[envKey];
  const global = process.env.REASONING_MODEL;
  const choice = (perAgent || global || "opus").toLowerCase();
  return choice === "luna" ? "luna" : "opus";
}

/**
 * Luna reasoning effort for an agent (Luna only). Resolution mirrors the model:
 *   REASONING_EFFORT__<agent>  >  REASONING_EFFORT  >  undefined (Luna default: medium)
 * Lower effort = faster + cheaper (reasoning tokens bill as output).
 */
function resolveEffort(agent: string): LunaEffort | undefined {
  const envKey = "REASONING_EFFORT__" + agent.replace(/-/g, "_");
  const raw = (process.env[envKey] || process.env.REASONING_EFFORT || "").toLowerCase();
  return VALID_EFFORTS.includes(raw as LunaEffort) ? (raw as LunaEffort) : undefined;
}

/**
 * Route a reasoning-agent JSON call to the configured model.
 * Drop-in for `callClaudeJSON` in tool-free synthesis agents.
 */
export async function callReasoningJSON<T>({ agent, systemPrompt, userPrompt, temperature }: ReasoningOptions): Promise<T> {
  const model = resolveModel(agent);

  let parsed: T;
  if (model === "luna") {
    // Luna is primary. If it errors (network, empty response, unparseable JSON,
    // provider outage) fall back to Opus so the pipeline never dies on Luna.
    // Disable with REASONING_FALLBACK=off.
    try {
      parsed = await callLunaJSON<T>({ systemPrompt, userPrompt, effort: resolveEffort(agent) });
    } catch (err) {
      const fallbackDisabled = (process.env.REASONING_FALLBACK || "").toLowerCase() === "off";
      if (fallbackDisabled) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[reasoning] ${agent}: Luna failed (${msg}) — falling back to Opus`);
      parsed = await callClaudeJSON<T>({ systemPrompt, userPrompt, temperature });
    }
  } else {
    parsed = await callClaudeJSON<T>({ systemPrompt, userPrompt, temperature });
  }

  // Enum safety net (provider-agnostic; no-op when the model obeyed the vocabulary).
  sanitizeSolutionIds(parsed, agent);

  return parsed;
}

/** Which model would run for an agent — for logging / debug endpoints. */
export function reasoningModelFor(agent: string): ReasoningModel {
  return resolveModel(agent);
}
