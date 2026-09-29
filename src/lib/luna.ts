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

// Global in-process cap on concurrent Luna calls. The pipeline fans out many
// reasoning agents at once (up to ~15 across parallel jobs), which bursts over
// the Foundry TPM limit → 429 → Opus fallback. This service runs at Cloud Run
// maxScale=1 (single instance), so ONE process-level gate throttles ALL Luna
// traffic and keeps bursts under TPM without raising quota. Excess calls queue.
// Tune with LUNA_MAX_CONCURRENCY (default 4).
const MAX_CONCURRENCY = Math.max(1, Number(process.env.LUNA_MAX_CONCURRENCY) || 4);
let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  // Full — queue until a release hands us a slot (active stays at the cap).
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next(); // hand the slot straight to the next waiter; active unchanged
  else active = Math.max(0, active - 1);
}

export async function callLuna({ systemPrompt, userPrompt, effort }: LunaOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: getModel(),
    instructions: systemPrompt,
    input: userPrompt,
    max_output_tokens: 32768,
    ...(effort ? { reasoning: { effort } } : {}),
  };

  await acquire();
  let response: Response;
  try {
    response = await fetchWithRetry(body);
  } finally {
    release();
  }
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

// The pipeline fires many reasoning agents at once, which bursts over Luna's
// Foundry TPM limit → HTTP 429. Those are transient (Retry-After is ~1s), so we
// retry generously and honor Retry-After — a burst rides out on Luna instead of
// failing over to Opus (the old maxRetries=2 gave up after one 5s wait, which is
// why ~44% of calls leaked to Opus). Network errors, by contrast, signal a real
// outage: only NETWORK_MAX quick tries, then fail fast so the router hits Opus.
async function fetchWithRetry(body: Record<string, unknown>, maxRetries = 6): Promise<Response> {
  const NETWORK_MAX = 2; // quick failover to Opus on a genuine outage
  let networkAttempts = 0;
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
      networkAttempts++;
      if (networkAttempts < NETWORK_MAX) {
        const backoff = networkAttempts * 3000 + Math.floor(Math.random() * 500);
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[luna] Network error: ${msg}, retrying in ${Math.round(backoff / 1000)}s (net ${networkAttempts}/${NETWORK_MAX})`);
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
      // Honor Retry-After (seconds) when the server sends it; otherwise exponential
      // backoff capped at 8s. Jitter avoids all burst-throttled calls retrying in lockstep.
      const retryAfterRaw = response.headers.get("retry-after");
      const ra = Number(retryAfterRaw);
      const base = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(8000, 1000 * 2 ** attempt);
      const backoff = base + Math.floor(Math.random() * 500);
      console.log(`[luna] Retryable ${response.status} (retry-after=${retryAfterRaw ?? "-"}), waiting ${Math.round(backoff / 1000)}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    throw new Error(`Luna Foundry error ${response.status}: ${err}`);
  }
  throw new Error("Luna: max retries exceeded");
}
