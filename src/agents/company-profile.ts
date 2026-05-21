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

  const { data } = await callGeminiGrounded<CompanyProfileOutput>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research and produce the company profile for: ${companyName}${contextStr}

Search for real, current information about the company:
1. Company official website and about page
2. Recent revenue figures (10-K filings, earnings releases, news)
3. Employee count (company website, LinkedIn, recent filings)
4. Headquarters location
5. Business description and industry classification

For every source you cite, include the URL where you found the information.

Respond ONLY with the JSON object matching the output schema.`,
  });
  return data;
}
