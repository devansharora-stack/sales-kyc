import { GoogleGenAI } from "@google/genai";

/**
 * Gemini client that supports two auth modes:
 *
 * 1. API key (GEMINI_API_KEY) — simple, direct to Gemini API
 * 2. Service account (GCP_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS)
 *    — goes through Vertex AI, bills to company GCP project
 *
 * Locally: uses GOOGLE_APPLICATION_CREDENTIALS file path from env
 * On Vercel: uses GCP_SERVICE_ACCOUNT_KEY (base64-encoded JSON) env var
 */

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;

  // Option 1: Service account via Vertex AI (preferred for production)
  if (process.env.GCP_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // On Vercel: write base64 key to tmp file
    if (process.env.GCP_SERVICE_ACCOUNT_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const keyJson = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8");
      const tmpPath = path.join(os.tmpdir(), "gcp-key.json");
      fs.writeFileSync(tmpPath, keyJson);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
    }

    cachedClient = new GoogleGenAI({
      vertexai: true,
      project: process.env.GCP_PROJECT_ID || "internal-marketing-496313",
      location: process.env.GCP_LOCATION || "us-central1",
      googleAuthOptions: {
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      },
    });
    return cachedClient;
  }

  // Option 2: Simple API key
  if (process.env.GEMINI_API_KEY) {
    cachedClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return cachedClient;
  }

  throw new Error(
    "Gemini: No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS (local), GCP_SERVICE_ACCOUNT_KEY (Vercel), or GEMINI_API_KEY."
  );
}

// Research agents — use Gemini 2.5 Flash (fast, cheaper)
const RESEARCH_MODEL = "gemini-2.5-flash";
// Light tasks — verification, summaries
const LIGHT_MODEL = "gemini-2.5-flash";

// Rate limiting: Vertex AI (service account) has high limits (~1000 RPM).
// Free API key tier is 5 RPM — only throttle if using that.
let lastRequestTime = 0;
const isServiceAccount = !!(process.env.GCP_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS);
const MIN_DELAY_MS = isServiceAccount ? 200 : 13000;

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

interface GeminiOptions {
  systemPrompt: string;
  userPrompt: string;
  useGrounding?: boolean; // Enable Google Search grounding
  model?: "research" | "light";
  temperature?: number;
}

async function callGeminiOnce({
  systemPrompt,
  userPrompt,
  useGrounding = false,
  model = "research",
  temperature = 0.2,
}: GeminiOptions): Promise<string> {
  const genAI = getClient();
  const modelId = model === "research" ? RESEARCH_MODEL : LIGHT_MODEL;
  const tools = useGrounding ? [{ googleSearch: {} }] : undefined;

  await waitForRateLimit();

  const response = await genAI.models.generateContent({
    model: modelId,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature,
      tools,
    },
  });

  return response.text || "";
}

export async function callGemini(options: GeminiOptions): Promise<string> {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callGeminiOnce(options);
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("503") ||
          error.message.includes("UNAVAILABLE") ||
          error.message.includes("overloaded"));

      if (isRetryable && attempt < maxRetries - 1) {
        const backoff = (attempt + 1) * 20000; // 20s, 40s, 60s, 80s
        console.log(`[gemini] Retryable error, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Gemini: max retries exceeded");
}

/**
 * Call Gemini and parse the response as JSON.
 * Strips markdown code fences if present.
 */
export async function callGeminiJSON<T>(options: GeminiOptions): Promise<T> {
  const text = await callGemini(options);
  if (!text || text.trim().length === 0) {
    throw new Error("Gemini returned empty response — cannot parse JSON");
  }
  return extractGeminiJSON<T>(text);
}

// ─── Grounded research client ───

export interface GroundingSource {
  url: string;
  title: string;
  domain: string;
}

export interface GroundedResult<T> {
  data: T;
  groundingSources: GroundingSource[];
}

/**
 * Call Gemini with Google Search grounding and return both the parsed JSON
 * AND the grounding sources (real URLs from Google Search).
 *
 * This is the primary function for research agents. Every URL in
 * groundingSources was actually returned by Google Search — not hallucinated.
 */
export async function callGeminiGrounded<T>(options: Omit<GeminiOptions, "useGrounding">): Promise<GroundedResult<T>> {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const genAI = getClient();
      const modelId = options.model === "light" ? LIGHT_MODEL : RESEARCH_MODEL;

      await waitForRateLimit();

      const response = await genAI.models.generateContent({
        model: modelId,
        contents: [{ role: "user", parts: [{ text: options.userPrompt }] }],
        config: {
          systemInstruction: options.systemPrompt,
          temperature: options.temperature ?? 0.2,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "";
      if (!text) throw new Error("Gemini returned no text");

      // Extract grounding sources from metadata
      // Vertex AI returns redirect URLs (vertexaisearch.cloud.google.com/grounding-api-redirect/...)
      // These are valid grounding references — Gemini also uses these in its JSON output
      const groundingSources: GroundingSource[] = [];
      const candidates = (response as any).candidates || [];
      for (const candidate of candidates) {
        const chunks = candidate?.groundingMetadata?.groundingChunks || [];
        for (const chunk of chunks) {
          if (chunk.web?.uri) {
            groundingSources.push({
              url: chunk.web.uri,
              title: chunk.web.title || "",
              domain: chunk.web.domain || "",
            });
          }
        }
      }

      // Deduplicate sources by URL
      const seenUrls = new Set<string>();
      const uniqueSources = groundingSources.filter((s) => {
        if (seenUrls.has(s.url)) return false;
        seenUrls.add(s.url);
        return true;
      });

      const data = extractGeminiJSON<T>(text);

      // Inject grounding sources into the parsed output
      // Walk the object and validate any source URLs against grounding results
      injectGroundingSources(data, uniqueSources);

      return { data, groundingSources: uniqueSources };
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("503") ||
          error.message.includes("UNAVAILABLE") ||
          error.message.includes("overloaded"));

      if (isRetryable && attempt < maxRetries - 1) {
        const backoff = (attempt + 1) * 20000;
        console.log(`[gemini] Retryable error, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Gemini grounded: max retries exceeded");
}

/**
 * Walk the parsed JSON output and validate source URLs against grounding.
 *
 * Vertex AI returns redirect URLs (vertexaisearch.cloud.google.com/grounding-api-redirect/...).
 * Gemini puts these SAME redirect URLs in its JSON output.
 * So we match on: exact redirect URL, or same domain (from chunk metadata).
 */
function injectGroundingSources(obj: any, groundingSources: GroundingSource[]): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) injectGroundingSources(item, groundingSources);
    return;
  }

  // Source-like object with url field
  if (typeof obj.url === "string" && obj.url.startsWith("http") && ("label" in obj || "type" in obj)) {
    obj._grounded = isGroundedUrl(obj.url, groundingSources);
    if (!obj._grounded) {
      console.log(`[gemini] Ungrounded source URL from domain: ${extractDomain(obj.url)}`);
    }
  }

  // Stakeholder-like object with sourceUrl field
  if (typeof obj.sourceUrl === "string" && obj.sourceUrl.startsWith("http")) {
    obj._grounded = isGroundedUrl(obj.sourceUrl, groundingSources);
    if (!obj._grounded) {
      console.log(`[gemini] Ungrounded stakeholder sourceUrl from domain: ${extractDomain(obj.sourceUrl)}`);
    }
  }

  for (const val of Object.values(obj)) {
    injectGroundingSources(val, groundingSources);
  }
}

/**
 * Check if a URL is grounded (came from Google Search).
 *
 * Vertex AI wraps all URLs in redirect URLs. The JSON output contains
 * redirect URLs, and the grounding chunks also contain redirect URLs —
 * but they're DIFFERENT redirect tokens for the same underlying page.
 *
 * So we can't match on redirect URL. Instead:
 * - All redirect URLs are treated as grounded (they came from Gemini's search)
 * - Regular URLs are matched against grounding source domains
 */
function isGroundedUrl(url: string, groundingSources: GroundingSource[]): boolean {
  // All Vertex AI redirect URLs are grounded by definition —
  // Gemini can only generate these from actual search results
  if (url.includes("vertexaisearch.cloud.google.com/grounding-api-redirect")) {
    return true;
  }

  // Regular URLs — match against grounding source domains
  const domain = extractDomain(url);
  if (domain) {
    return groundingSources.some((s) => s.domain === domain || s.domain?.endsWith("." + domain));
  }

  return false;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ─── Shared utilities ───

function extractGeminiJSON<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    // Find first { or [ and parse from there
    const start = cleaned.search(/[\[{]/);
    if (start >= 0) {
      const jsonCandidate = cleaned.slice(start);
      try {
        return JSON.parse(jsonCandidate) as T;
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : "";
        console.log(`[gemini] JSON parse failed: ${msg}, attempting repair...`);

        // Try 1: Extract just the root object (strip trailing junk after root closes)
        const extracted = extractRootObject(jsonCandidate);
        if (extracted !== jsonCandidate) {
          try {
            return JSON.parse(extracted) as T;
          } catch { /* fall through to truncation repair */ }
        }

        // Try 2: Repair truncated JSON (missing closers)
        try {
          return JSON.parse(repairTruncatedJSON(jsonCandidate)) as T;
        } catch { /* fall through */ }

        // Try 3: Extract root then repair (handles both extra + missing)
        try {
          return JSON.parse(repairTruncatedJSON(extracted)) as T;
        } catch {
          throw e2;
        }
      }
    }
    throw new Error(`Failed to parse JSON from Gemini response: ${cleaned.slice(0, 200)}`);
  }
}

/**
 * Extract just the root JSON object/array by tracking brace depth.
 * Stops at the point where the root closes — strips trailing junk.
 */
function extractRootObject(json: string): string {
  const opener = json[0];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (ch === '"' && (i === 0 || json[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        return json.substring(0, i + 1);
      }
    }
  }
  // Never closed — return as-is for truncation repair to handle
  return json;
}

function repairTruncatedJSON(json: string): string {
  let s = json;

  // Step 1: If we're inside an unterminated string, cut back to before it started
  let inString = false;
  let lastOutsideString = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      if (inString) lastOutsideString = i; // remember where the string opened
    }
    if (!inString) lastOutsideString = i;
  }
  if (inString) {
    // Cut back to before this unterminated string started
    s = s.substring(0, lastOutsideString);
  }

  // Step 2: Remove trailing incomplete key-value pairs, colons, commas
  s = s.replace(/,\s*$/, "");
  s = s.replace(/:\s*$/, "");
  // If we end with a key string (after removing colon), cut the key too
  s = s.replace(/,?\s*"[^"]*"\s*$/, "");
  s = s.replace(/,\s*$/, "");

  // Step 3: Count open braces/brackets and close them
  const stack: string[] = [];
  inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  s = s.replace(/,\s*$/, "");
  while (stack.length > 0) s += stack.pop();
  return s;
}
