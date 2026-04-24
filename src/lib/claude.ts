/**
 * Claude Opus client via Azure AI Foundry.
 * All agents use this — no Gemini dependency.
 */

interface ClaudeOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

const FOUNDRY_URL =
  process.env.AZURE_AI_FOUNDRY_ENDPOINT + "/anthropic/v1/messages";
const FOUNDRY_KEY = process.env.AZURE_AI_FOUNDRY_API_KEY!;
const MODEL = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-6";

async function callClaudeOnce({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
}: ClaudeOptions): Promise<string> {
  const response = await fetch(FOUNDRY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": FOUNDRY_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude Foundry error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

export async function callClaude(options: ClaudeOptions): Promise<string> {
  const maxRetries = 4;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callClaudeOnce(options);
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("529") ||
          error.message.includes("503") ||
          error.message.includes("overloaded") ||
          error.message.includes("rate"));

      if (isRetryable && attempt < maxRetries - 1) {
        const backoff = (attempt + 1) * 10000; // 10s, 20s, 30s
        console.log(
          `[claude] Retryable error, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Claude: max retries exceeded");
}

/**
 * Call Claude and parse the response as JSON.
 * Handles: raw JSON, ```json fenced blocks, or JSON embedded in prose.
 */
export async function callClaudeJSON<T>(options: ClaudeOptions): Promise<T> {
  const text = await callClaude(options);

  // Try 1: Extract from ```json ... ``` code block
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim()) as T;
  }

  // Try 2: Strip leading/trailing fences (response is entirely fenced)
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Try 3: Find first { or [ and parse from there
    const start = stripped.search(/[\[{]/);
    if (start >= 0) {
      return JSON.parse(stripped.slice(start)) as T;
    }
    throw new Error(`Failed to parse JSON from Claude response: ${stripped.slice(0, 200)}`);
  }
}
