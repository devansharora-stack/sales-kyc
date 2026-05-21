/**
 * Tech Stack Agent — Phase 1 (Foundation)
 * Uses Gemini Flash with Google Search grounding for research.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callGeminiGrounded } from "@/lib/gemini";
import type { TechLandscape } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/tech-stack.md"),
  "utf-8"
);

export async function runTechStack(companyName: string): Promise<TechLandscape> {
  const { data } = await callGeminiGrounded<TechLandscape>({
    systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
    userPrompt: `Research and produce the technology landscape for: ${companyName}

Search for real information about their tech stack:
1. "${companyName} technology stack" or "${companyName} engineering blog"
2. "${companyName} cloud provider AWS Azure GCP"
3. "${companyName} Google Workspace Microsoft 365"
4. "${companyName} AI machine learning deployment"
5. "${companyName} job postings engineering" (for tech stack clues)
6. "${companyName} vendor partnerships technology"

For every source you cite, include the URL where you found the information.

Respond ONLY with the JSON object matching the output schema.`,
  });
  return data;
}
