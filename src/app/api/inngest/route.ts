import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { researchCompany } from "@/agents/orchestrator";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [researchCompany],
});
