/**
 * Company Profile Agent — Phase 1 (Foundation)
 * Uses Gemini Flash with Google Search grounding for research.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callGeminiGrounded } from "@/lib/gemini";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/company-profile.md"),
  "utf-8"
);

interface CompanyProfileOutput {
  slug: string;
  name: string;
  fullName: string;
  industry: string;
  subSector: string;
  hqCity: string;
  state: string;
  revenue: { value: string; sources: { label: string; url: string; date: string; type: string }[] };
  employees: { value: string; sources: { label: string; url: string; date: string; type: string }[] };
  businessDescription: string;
  execSummary: string;
}

export async function runCompanyProfile(companyName: string, context?: Record<string, string>): Promise<CompanyProfileOutput> {
  const contextStr = context && Object.keys(context).length > 0
    ? `\n\nAdditional context: ${JSON.stringify(context)}`
    : "";

  const prompt = `Research and produce the company profile for: ${companyName}${contextStr}

Search for real, current information about the company:
1. Company official website and about page
2. Recent revenue figures (10-K filings, earnings releases, news)
3. Employee count (company website, LinkedIn, recent filings)
4. Headquarters location
5. Business description and industry classification

For every source you cite, include the URL where you found the information.

IMPORTANT: Keep your JSON response concise. businessDescription should be 2-3 sentences max. execSummary should be 3-4 sentences max. Do NOT include lengthy text — this prevents JSON truncation.

Respond ONLY with the JSON object matching the output schema.`;

  const REQUIRED_FIELDS: (keyof CompanyProfileOutput)[] = [
    "slug", "name", "industry", "businessDescription", "execSummary",
  ];

  // Retry up to 2 times on missing fields or JSON parse errors
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let data: CompanyProfileOutput;
    try {
      const result = await callGeminiGrounded<CompanyProfileOutput>({
        systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
        userPrompt: prompt,
      });
      data = result.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        console.log(`[company-profile] Error on attempt ${attempt + 1}/3: ${lastError.message.slice(0, 120)} — retrying...`);
        continue;
      }
      throw lastError;
    }

    const missing = REQUIRED_FIELDS.filter((f) => !data[f]);
    if (missing.length === 0) return data;

    if (attempt < 2) {
      console.log(
        `[company-profile] Missing fields (${missing.join(", ")}) — retrying (attempt ${attempt + 2}/3)`
      );
    } else {
      console.log(
        `[company-profile] Still missing fields after 3 attempts: ${missing.join(", ")}`
      );
      return data;
    }
  }

  if (lastError) throw lastError;
  throw new Error("Unreachable");
}
