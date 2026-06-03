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
          error.message.includes("overloaded") ||
          error.message.includes("fetch failed") ||
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("TimeoutError") ||
          error.message.includes("network"));

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
      // Extract grounding sources from metadata
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

      // Resolve redirect URLs to real destinations (before they expire)
      const redirectMap = new Map<string, string>();
      const redirectUrls = groundingSources
        .filter((s) => isVertexRedirectUrl(s.url))
        .map((s) => s.url);

      if (redirectUrls.length > 0) {
        const BATCH = 10;
        for (let i = 0; i < redirectUrls.length; i += BATCH) {
          const batch = redirectUrls.slice(i, i + BATCH);
          const resolved = await Promise.allSettled(
            batch.map(async (url) => {
              const real = await resolveRedirectUrl(url);
              return { redirect: url, real };
            })
          );
          for (const r of resolved) {
            if (r.status === "fulfilled" && r.value.real) {
              redirectMap.set(r.value.redirect, r.value.real);
            }
          }
        }
        console.log(`[gemini] Resolved ${redirectMap.size}/${redirectUrls.length} redirect URLs`);
      }

      // Replace redirect URLs with real URLs in grounding sources
      for (const src of groundingSources) {
        const real = redirectMap.get(src.url);
        if (real) src.url = real;
      }

      const data = extractGeminiJSON<T>(text);

      // Replace redirect URLs in the parsed JSON output using chunk redirectMap
      if (redirectMap.size > 0) {
        replaceRedirectUrls(data, redirectMap);
      }

      // Find any REMAINING Vertex redirect URLs in the parsed output
      // (Gemini uses different tokens in text vs metadata — chunk map won't cover all)
      const remainingRedirects = collectVertexUrls(data);
      if (remainingRedirects.length > 0) {
        console.log(`[gemini] Found ${remainingRedirects.length} additional Vertex redirect URL(s) in output — resolving...`);
        const extraMap = new Map<string, string>();
        const BATCH = 10;
        for (let i = 0; i < remainingRedirects.length; i += BATCH) {
          const batch = remainingRedirects.slice(i, i + BATCH);
          const resolved = await Promise.allSettled(
            batch.map(async (url) => {
              const real = await resolveRedirectUrl(url);
              return { redirect: url, real };
            })
          );
          for (const r of resolved) {
            if (r.status === "fulfilled" && r.value.real) {
              extraMap.set(r.value.redirect, r.value.real);
              // Also add to main redirectMap for grounding source replacement
              redirectMap.set(r.value.redirect, r.value.real);
            }
          }
        }
        if (extraMap.size > 0) {
          replaceRedirectUrls(data, extraMap);
          console.log(`[gemini] Resolved ${extraMap.size}/${remainingRedirects.length} additional redirect URL(s)`);
        }
      }

      // Final pass: strip any STILL unresolved Vertex URLs (domain doesn't exist, can't resolve)
      // Build domain fallback map from grounding chunks (we know the domain even if redirect fails)
      const domainFallbacks = new Map<string, string>();
      for (const src of groundingSources) {
        if (isVertexRedirectUrl(src.url) && src.domain) {
          domainFallbacks.set(src.url, `https://www.${src.domain}`);
        }
      }
      // Apply domain fallbacks to grounding sources
      for (const src of groundingSources) {
        if (isVertexRedirectUrl(src.url)) {
          const fallback = domainFallbacks.get(src.url);
          if (fallback) src.url = fallback;
        }
      }
      // Strip any remaining unresolvable Vertex URLs from output and grounding sources
      stripUnresolvedRedirects(data);
      const resolvedSources = groundingSources.filter((s) => !isVertexRedirectUrl(s.url));
      if (resolvedSources.length < groundingSources.length) {
        console.log(`[gemini] Stripped ${groundingSources.length - resolvedSources.length} unresolvable Vertex URL(s) from grounding sources`);
      }

      // Deduplicate sources by URL
      const seenUrls = new Set<string>();
      const uniqueSources = resolvedSources.filter((s) => {
        if (seenUrls.has(s.url)) return false;
        seenUrls.add(s.url);
        return true;
      });

      // Verify ungrounded URLs: quick liveness check, strip only confirmed dead
      const ungroundedUrls = [...new Set(collectUngroundedUrls(data, uniqueSources))];
      if (ungroundedUrls.length > 0) {
        const deadUrls = new Set<string>();
        const BATCH = 10;
        for (let i = 0; i < ungroundedUrls.length; i += BATCH) {
          const batch = ungroundedUrls.slice(i, i + BATCH);
          const checks = await Promise.allSettled(
            batch.map(async (url) => ({ url, live: await isUrlReachable(url) }))
          );
          for (const c of checks) {
            if (c.status === "fulfilled" && !c.value.live) deadUrls.add(c.value.url);
          }
        }
        if (deadUrls.size > 0) {
          const stripped = stripDeadUrls(data, deadUrls);
          console.log(`[gemini] Verified ${ungroundedUrls.length} ungrounded URL(s): ${deadUrls.size} dead stripped, ${ungroundedUrls.length - deadUrls.size} live kept`);
        } else {
          console.log(`[gemini] Verified ${ungroundedUrls.length} ungrounded URL(s): all live`);
        }
      }

      return { data, groundingSources: uniqueSources };
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED") ||
          error.message.includes("503") ||
          error.message.includes("UNAVAILABLE") ||
          error.message.includes("overloaded") ||
          error.message.includes("fetch failed") ||
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("TimeoutError") ||
          error.message.includes("network") ||
          error.message.includes("JSON") ||
          error.message.includes("parse"));

      if (isRetryable && attempt < maxRetries - 1) {
        const backoff = error.message.includes("JSON") || error.message.includes("parse")
          ? 2000 // JSON parse errors: quick retry (Gemini non-deterministic)
          : (attempt + 1) * 20000;
        console.log(`[gemini] Retryable error, waiting ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries}): ${error.message.slice(0, 100)}`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Gemini grounded: max retries exceeded");
}

/**
 * Collect all ungrounded URLs from the parsed output for batch verification.
 * Returns a list of { url, path } so we can trace back where to strip.
 */
function collectUngroundedUrls(obj: any, groundingSources: GroundingSource[]): string[] {
  const urls: string[] = [];
  if (!obj || typeof obj !== "object") return urls;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("http") && ("label" in item || "type" in item)) {
        if (!isGroundedUrl(item.url, groundingSources)) urls.push(item.url);
      } else {
        urls.push(...collectUngroundedUrls(item, groundingSources));
      }
    }
    return urls;
  }

  if (typeof obj.sourceUrl === "string" && obj.sourceUrl.startsWith("http")) {
    if (!isGroundedUrl(obj.sourceUrl, groundingSources)) urls.push(obj.sourceUrl);
  }

  for (const val of Object.values(obj)) {
    urls.push(...collectUngroundedUrls(val, groundingSources));
  }
  return urls;
}

/**
 * Strip confirmed-dead URLs from the parsed output.
 * Only removes URLs that are in the deadUrls set.
 * Returns count of stripped URLs.
 */
function stripDeadUrls(obj: any, deadUrls: Set<string>): number {
  if (!obj || typeof obj !== "object") return 0;
  let stripped = 0;

  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const item = obj[i];
      if (item && typeof item === "object" && typeof item.url === "string" && deadUrls.has(item.url)) {
        obj.splice(i, 1);
        stripped++;
      } else {
        stripped += stripDeadUrls(item, deadUrls);
      }
    }
    return stripped;
  }

  if (typeof obj.sourceUrl === "string" && deadUrls.has(obj.sourceUrl)) {
    obj.sourceUrl = "";
    stripped++;
  }

  for (const val of Object.values(obj)) {
    stripped += stripDeadUrls(val, deadUrls);
  }
  return stripped;
}

/**
 * Quick URL liveness check — HEAD with short timeout, GET fallback.
 * Returns true if URL is reachable (any non-404/410 status).
 */
async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    return res.status !== 404 && res.status !== 410;
  } catch {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });
      return res.status !== 404 && res.status !== 410;
    } catch {
      // Can't reach — treat as dead to be safe (Gemini may have hallucinated it)
      return false;
    }
  }
}

/**
 * Follow a Vertex AI redirect URL to get the real destination URL.
 * Must be done soon after Gemini returns — these redirects expire.
 */
async function resolveRedirectUrl(redirectUrl: string): Promise<string | null> {
  try {
    const res = await fetch(redirectUrl, {
      method: "GET",
      redirect: "manual", // Don't follow — just get the Location header
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KYCGenie/1.0)" },
    });
    // 3xx redirect — Location header has the real URL
    const location = res.headers.get("location");
    if (location && location.startsWith("http")) return location;
    // Some redirects return 200 with a meta refresh or JS redirect
    // In that case, try following the redirect normally
    if (res.ok) return null; // Got a page, not a redirect
    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively collect all Vertex AI redirect URLs found in parsed output.
 */
function collectVertexUrls(obj: any, found: string[] = []): string[] {
  if (!obj || typeof obj !== "object") return found;
  if (Array.isArray(obj)) {
    for (const item of obj) collectVertexUrls(item, found);
    return found;
  }
  for (const val of Object.values(obj)) {
    if (typeof val === "string" && isVertexRedirectUrl(val)) {
      found.push(val);
    } else if (typeof val === "object") {
      collectVertexUrls(val, found);
    }
  }
  return found;
}

/**
 * Recursively strip any unresolved Vertex AI redirect/grounding URLs from parsed output.
 * These are useless to end users — they're Google-internal URLs that may expire.
 */
function stripUnresolvedRedirects(obj: any): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    // Remove source-like objects with Vertex redirect URLs
    for (let i = obj.length - 1; i >= 0; i--) {
      const item = obj[i];
      if (item && typeof item === "object" && typeof item.url === "string" && isVertexRedirectUrl(item.url)) {
        obj.splice(i, 1);
      } else {
        stripUnresolvedRedirects(item);
      }
    }
    return;
  }
  // For sourceUrl fields (stakeholders), clear to empty string
  if (typeof obj.sourceUrl === "string" && isVertexRedirectUrl(obj.sourceUrl)) {
    obj.sourceUrl = "";
  }
  for (const val of Object.values(obj)) {
    stripUnresolvedRedirects(val);
  }
}

/**
 * Recursively replace redirect URLs with resolved real URLs in parsed output.
 */
function replaceRedirectUrls(obj: any, redirectMap: Map<string, string>): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) replaceRedirectUrls(item, redirectMap);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string" && redirectMap.has(obj[key])) {
      obj[key] = redirectMap.get(obj[key])!;
    } else if (typeof obj[key] === "object") {
      replaceRedirectUrls(obj[key], redirectMap);
    }
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
  // All Vertex AI redirect/grounding URLs are grounded by definition —
  // Gemini can only generate these from actual search results
  if (isVertexRedirectUrl(url)) {
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

/**
 * Check if a URL is a Vertex AI grounding redirect/reference URL.
 * Google uses multiple domains and path patterns:
 * - vertexaisearch.cloud.google.com/grounding-api-redirect/...
 * - vertexaisearch.google.com/grounding/...
 */
function isVertexRedirectUrl(url: string): boolean {
  return url.includes("vertexaisearch.cloud.google.com/grounding-api-redirect") ||
    url.includes("vertexaisearch.google.com/grounding");
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

        // Try 0: Sanitize control characters inside JSON strings
        const sanitized = sanitizeJsonStrings(jsonCandidate);
        if (sanitized !== jsonCandidate) {
          try {
            return JSON.parse(sanitized) as T;
          } catch { /* fall through */ }
        }

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

        // Try 3: Sanitize + repair combined
        try {
          return JSON.parse(repairTruncatedJSON(sanitizeJsonStrings(extracted))) as T;
        } catch { /* fall through */ }

        // Try 4: Extract root then repair (handles both extra + missing)
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
 * Sanitize control characters and unescaped special chars inside JSON string values.
 * Gemini sometimes emits raw newlines, tabs, or unescaped quotes within strings.
 */
function sanitizeJsonStrings(json: string): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const prev = i > 0 ? json[i - 1] : "";
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { result += '\\u' + code.toString(16).padStart(4, '0'); continue; }
    }
    result += ch;
  }
  return result;
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
