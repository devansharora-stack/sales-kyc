/**
 * Company Profile Agent — Phase 1 (Foundation)
 * Uses Claude Opus via Azure AI Foundry.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";

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

  return callClaudeJSON<CompanyProfileOutput>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research and produce the company profile for: ${companyName}${contextStr}\n\nRespond ONLY with the JSON object matching the output schema.`,
  });
}
