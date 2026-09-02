/**
 * Luna (GPT-5.6) client via Azure AI Foundry — OpenAI Responses API.
 *
 * Same Foundry resource + key as Claude, different surface:
 *   POST {LUNA_FOUNDRY_ENDPOINT}   (…/openai/v1/responses)
 *   header: api-key
 *   body:  { model, instructions (system), input (user), max_output_tokens }
 *   reply: output_text  (or output[].content[].text)
 *
 * Mirrors claude.ts: callLuna() → text, callLunaJSON<T>() → parsed JSON.
 * Trial provider for the reasoning layer; default pipeline still uses Opus.
 */

import { recordLlmUsage } from "@/lib/usage-context";
import { extractJSON } from "@/lib/json-extract";

export type LunaEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

interface LunaOptions {
  systemPrompt: string;
  userPrompt: string;
  /** reasoning.effort — omit to use Luna's default (medium). Lower = faster + cheaper. */
  effort?: LunaEffort;
}

function getEndpoint() {
  const e = process.env.LUNA_FOUNDRY_ENDPOINT;
  if (!e) throw new Error("LUNA_FOUNDRY_ENDPOINT is not set");
  return e;
}
function getKey() {
  const k = process.env.LUNA_FOUNDRY_API_KEY;
  if (!k) throw new Error("LUNA_FOUNDRY_API_KEY is not set");
  return k;
}
function getModel() {
  return process.env.LUNA_DEPLOYMENT || "gpt-5.6-luna";
}

export async function callLuna({ systemPrompt, userPrompt, effort }: LunaOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: getModel(),
    instructions: systemPrompt,
    input: userPrompt,
    max_output_tokens: 32768,
    ...(effort ? { reasoning: { effort } } : {}),
  };

  const response = await fetchWithRetry(body);
  const data = await response.json();

  recordLlmUsage({
    provider: "luna",
    model: getModel(),
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  });

  const text =
    data.output_text ??
    (Array.isArray(data.output)
      ? data.output.flatMap((o: any) => (o.content || []).map((c: any) => c.text)).filter(Boolean).join("")
      : "");

  if (data.status === "incomplete" && data.incomplete_details?.reason === "max_output_tokens") {
    console.warn(`[luna] Response truncated by max_output_tokens. Output may be incomplete.`);
  }
  return text || "";
}

export async function callLunaJSON<T>(options: LunaOptions): Promise<T> {
  const text = await callLuna(options);
  if (!text || text.trim().length === 0) {
    throw new Error("Luna returned empty response — cannot parse JSON");
  }
  return extractJSON<T>(text);
}

async function fetchWithRetry(body: Record<string, unknown>, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetch(getEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": getKey(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      if (attempt < maxRetries - 1) {
        const backoff = (attempt + 1) * 10000;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[luna] Network error: ${msg}, retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }

    if (response.ok) return response;

    const err = await response.text();
    const isRetryable =
      response.status === 429 || response.status === 529 || response.status === 503 ||
      err.includes("overloaded") || err.includes("rate");

    if (isRetryable && attempt < maxRetries - 1) {
      const backoff = (attempt + 1) * 5000;
      console.log(`[luna] Retryable error ${response.status}, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    throw new Error(`Luna Foundry error ${response.status}: ${err}`);
  }
  throw new Error("Luna: max retries exceeded");
}
