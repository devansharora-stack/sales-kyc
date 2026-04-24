import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Research agents — use Gemini 2.5 Flash (Pro needs billing)
const RESEARCH_MODEL = "gemini-2.5-flash";
// Light tasks — verification, summaries
const LIGHT_MODEL = "gemini-2.5-flash";

// Rate limiting: free tier allows 5 requests/min per model
// We serialize requests with a delay to stay within limits
let lastRequestTime = 0;
const MIN_DELAY_MS = 13000; // ~4.6 requests/min to stay safely under 5/min

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

  // Strip markdown code fences
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned) as T;
}
