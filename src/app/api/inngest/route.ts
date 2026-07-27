import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { researchCompany } from "@/agents/orchestrator";
import { analyzeStakeholder } from "@/agents/stakeholder-orchestrator";
import { generatePortfolioGTM } from "@/agents/portfolio-orchestrator";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [researchCompany, analyzeStakeholder, generatePortfolioGTM],
});
