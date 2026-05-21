/**
 * Claude Opus client via Azure AI Foundry.
 *
 * Two modes:
 *   callClaudeJSON()      — simple one-shot, no tools (for synthesis agents)
 *   callClaudeWithTools()  — with server-side web search (for research agents)
 *
 * The web_search tool is Anthropic's built-in server-side tool.
 * Claude searches the web itself — no external API key needed.
 * Same mechanism Claude Code uses in west-coast research.
 */

interface ClaudeOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

// Lazy getters — env vars may not be set at module load time (e.g. test scripts)
function getFoundryUrl() {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;
  if (!endpoint) throw new Error("AZURE_AI_FOUNDRY_ENDPOINT is not set");
  return endpoint + "/anthropic/v1/messages";
}
function getFoundryKey() {
  const key = process.env.AZURE_AI_FOUNDRY_API_KEY;
  if (!key) throw new Error("AZURE_AI_FOUNDRY_API_KEY is not set");
  return key;
}
function getModel() {
  return process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "claude-opus-4-6";
}

// ─── Simple client (no tools) ───

export async function callClaude({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
}: ClaudeOptions): Promise<string> {
  const body = {
    model: getModel(),
    max_tokens: 16384,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const response = await fetchWithRetry(body);
  const data = await response.json();
  if (data.stop_reason === "max_tokens") {
    console.warn(`[claude] Response truncated by max_tokens (${body.max_tokens}). Output may be incomplete.`);
  }
  return data.content?.[0]?.text || "";
}

export async function callClaudeJSON<T>(options: ClaudeOptions): Promise<T> {
  const text = await callClaude(options);
  return extractJSON<T>(text);
}

// ─── Agentic client with server-side web search ───

interface ToolUseOptions extends ClaudeOptions {
  /** Max search uses per request (default 10) */
  maxSearchUses?: number;
}

/**
 * Call Claude with the built-in web_search tool.
 * Anthropic executes the searches server-side — same as Claude Code.
 * No external search API needed.
 *
 * After parsing the JSON output, we cross-validate: every URL in the
 * output must have appeared in a web_search_tool_result block.
 * URLs from Claude's memory/training data are stripped.
 */
export async function callClaudeWithTools<T>(options: ToolUseOptions): Promise<T> {
  const {
    systemPrompt,
    userPrompt,
    temperature = 0.2,
    maxSearchUses = 10,
  } = options;

  const body = {
    model: getModel(),
    max_tokens: 16384,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: maxSearchUses,
      },
    ],
  };

  const response = await fetchWithRetry(body);
  const data = await response.json();

  // Extract text blocks and collect all URLs from web_search_tool_result blocks
  const content: any[] = data.content || [];
  const textParts: string[] = [];
  const searchResultUrls = new Set<string>();

  for (const block of content) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
    // Collect URLs from web search results — these are the ONLY valid source URLs
    if (block.type === "web_search_tool_result" && block.content) {
      for (const result of block.content) {
        if (result.type === "web_search_result" && result.url) {
          searchResultUrls.add(result.url);
          // Also add the base URL (some results link to specific pages)
          try {
            const u = new URL(result.url);
            searchResultUrls.add(`${u.origin}${u.pathname}`);
          } catch {}
        }
      }
    }
  }

  const fullText = textParts.join("\n");
  if (!fullText) {
    throw new Error("Claude returned no text in response");
  }

  const parsed = extractJSON<T>(fullText);

  // Cross-validate: strip any source URLs that didn't come from search results
  if (searchResultUrls.size > 0) {
    stripFabricatedUrls(parsed, searchResultUrls);
  }

  return parsed;
}

/**
 * Recursively walk the parsed output and remove any source URL
 * that was NOT in the web search results.
 * This is the nuclear option against hallucinated URLs.
 */
function stripFabricatedUrls(obj: any, validUrls: Set<string>): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      stripFabricatedUrls(item, validUrls);
    }
    return;
  }

  // If this object has a "url" field and it's a source-like object, validate it
  if (typeof obj.url === "string" && obj.url.startsWith("http") && ("label" in obj || "type" in obj)) {
    if (!isUrlFromSearch(obj.url, validUrls)) {
      const strippedUrl = obj.url;
      obj.url = "";
      obj._fabricated = true;
      console.log(`[claude] Stripped fabricated URL: ${strippedUrl}`);
    }
  }

  // Recurse into all values
  for (const val of Object.values(obj)) {
    stripFabricatedUrls(val, validUrls);
  }
}

/**
 * Check if a URL matches any URL from the web search results.
 * Uses domain + path prefix matching to handle minor variations
 * (trailing slashes, query params, etc.)
 */
function isUrlFromSearch(url: string, validUrls: Set<string>): boolean {
  // Exact match
  if (validUrls.has(url)) return true;

  // Normalize and try again
  try {
    const parsed = new URL(url);
    const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
    for (const valid of validUrls) {
      const validNorm = valid.replace(/\/$/, "");
      // Exact normalized match
      if (normalized === validNorm) return true;
      // Same domain + path prefix match (for sub-pages of a result)
      try {
        const vp = new URL(valid);
        if (parsed.hostname === vp.hostname && parsed.pathname.startsWith(vp.pathname)) return true;
      } catch {}
    }
  } catch {}

  return false;
}

// ─── Shared utilities ───

function extractJSON<T>(text: string): T {
  // Try 1: Extract from ```json ... ``` code block
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fenceMatch) {
    return parseWithRepair<T>(fenceMatch[1].trim());
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
      return parseWithRepair<T>(stripped.slice(start));
    }
    throw new Error(`Failed to parse JSON from Claude response: ${stripped.slice(0, 200)}`);
  }
}

/**
 * Attempt JSON.parse, and if it fails with a truncation error,
 * try to repair the JSON by closing open strings, arrays, and objects.
 */
function parseWithRepair<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Only attempt repair for truncation-like errors
    if (
      msg.includes("Unterminated string") ||
      msg.includes("Unexpected end of JSON") ||
      msg.includes("Expected")
    ) {
      console.log(`[claude] Attempting JSON repair for: ${msg}`);
      const repaired = repairTruncatedJSON(json);
      return JSON.parse(repaired) as T;
    }
    throw e;
  }
}

/**
 * Repair truncated JSON by closing open structures.
 * Handles: unterminated strings, unclosed arrays/objects, trailing commas.
 */
function repairTruncatedJSON(json: string): string {
  // Remove any trailing incomplete key-value pair or string
  // Find the last complete value by looking for the last proper delimiter
  let s = json;

  // If we're in the middle of a string, close it
  let inString = false;
  let lastGoodIndex = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
    }
    if (!inString) {
      lastGoodIndex = i;
    }
  }

  if (inString) {
    // Truncate to before the last opening quote, then find last good break point
    // Or just close the string
    s = s.substring(0, lastGoodIndex + 1);
  }

  // Remove trailing comma
  s = s.replace(/,\s*$/, "");

  // Count open braces/brackets and close them
  const stack: string[] = [];
  inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Remove trailing comma again after potential string truncation
  s = s.replace(/,\s*$/, "");

  // Close all open structures
  while (stack.length > 0) {
    s += stack.pop();
  }

  return s;
}

async function fetchWithRetry(body: Record<string, unknown>, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(getFoundryUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getFoundryKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000), // 5 min timeout per request
    });

    if (response.ok) return response;

    const err = await response.text();
    const isRetryable =
      response.status === 429 ||
      response.status === 529 ||
      response.status === 503 ||
      err.includes("overloaded") ||
      err.includes("rate");

    if (isRetryable && attempt < maxRetries - 1) {
      const backoff = (attempt + 1) * 5000;
      console.log(`[claude] Retryable error ${response.status}, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    throw new Error(`Claude Foundry error ${response.status}: ${err}`);
  }
  throw new Error("Claude: max retries exceeded");
}
