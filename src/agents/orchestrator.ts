/**
 * Research Pipeline Orchestrator
 *
 * Inngest step function that coordinates the 4-phase agent pipeline
 * for a single company. Each agent runs as an Inngest step with
 * automatic retries. Progress is written to Supabase so the
 * frontend can subscribe via Realtime.
 */

import { inngest } from "@/lib/inngest";
import { createServerClient } from "@/lib/db";
import { scoreToRating } from "@/lib/types";
import type { CompanyDetail, GeminiStatus } from "@/lib/types";

// Agents
import { runCompanyProfile } from "./company-profile";
import { runTechStack } from "./tech-stack";
import { runFinancialSignal } from "./financial-signal";
import { runTriggerScanner } from "./trigger-scanner";
import { runPainPointAnalyzer } from "./pain-point-analyzer";
import { runStakeholderResearcher } from "./stakeholder-researcher";
import { runSolutionMapper } from "./solution-mapper";
import { runGTMGenerator } from "./gtm-generator";
import { runScoringAgent } from "./scoring-agent";
import { runVerification } from "./verification-agent";

// Helper: update a research step's status in Supabase
async function updateStep(
  jobId: string,
  agentName: string,
  update: Record<string, unknown>
) {
  const supabase = createServerClient();
  await supabase
    .from("research_steps")
    .update(update)
    .eq("job_id", jobId)
    .eq("agent_name", agentName);
}

// Helper: update research job progress
async function updateJobProgress(jobId: string, progress: number) {
  const supabase = createServerClient();
  await supabase
    .from("research_jobs")
    .update({ progress })
    .eq("id", jobId);
}

// Wraps an agent call with step status tracking
async function runAgentStep<T>(
  jobId: string,
  agentName: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  await updateStep(jobId, agentName, {
    status: "running",
    started_at: new Date().toISOString(),
  });

  try {
    const result = await fn();
    await updateStep(jobId, agentName, {
      status: "completed",
      output: result as Record<string, unknown>,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
    });
    return result;
  } catch (error) {
    await updateStep(jobId, agentName, {
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
    });
    throw error;
  }
}

export const researchCompany = inngest.createFunction(
  {
    id: "research-company",
    retries: 2,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "research/company.start" }],
  },
  async ({ event, step }: { event: { data: { jobId: string; companyName: string; companyContext?: Record<string, string> } }; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { jobId, companyName, companyContext } = event.data;

    const supabase = createServerClient();

    // Mark job as running
    await supabase
      .from("research_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    try {
      // ============================
      // Phase 1: Foundation (sequential — free tier rate limits)
      // ============================

      const [profile, techLandscape, financialSignals] = await step.run(
        "phase-1-foundation",
        async () => {
          const profile = await runAgentStep(jobId, "company_profile", () =>
            runCompanyProfile(companyName, companyContext)
          );
          await updateJobProgress(jobId, 10);

          const techLandscape = await runAgentStep(jobId, "tech_stack", () =>
            runTechStack(companyName)
          );
          await updateJobProgress(jobId, 20);

          const financialSignals = await runAgentStep(jobId, "financial_signal", () =>
            runFinancialSignal(companyName)
          );
          await updateJobProgress(jobId, 30);

          return [profile, techLandscape, financialSignals] as const;
        }
      );

      // ============================
      // Phase 2: Intelligence (parallel)
      // ============================

      const [triggers, painPoints, stakeholders] = await step.run(
        "phase-2-intelligence",
        async () => {
          const triggers = await runAgentStep(jobId, "trigger_scanner", () =>
            runTriggerScanner({
              companyName,
              profile: {
                industry: profile.industry,
                revenue: profile.revenue.value,
                employees: profile.employees.value,
                businessDescription: profile.businessDescription,
              },
            })
          );
          await updateJobProgress(jobId, 40);

          const painPoints = await runAgentStep(jobId, "pain_point_analyzer", () =>
            runPainPointAnalyzer({
              companyName,
              profile: {
                industry: profile.industry,
                subSector: profile.subSector,
                revenue: profile.revenue.value,
                employees: profile.employees.value,
                businessDescription: profile.businessDescription,
              },
              triggers,
              techLandscape,
              financialSignals,
            })
          );
          await updateJobProgress(jobId, 50);

          const stakeholders = await runAgentStep(jobId, "stakeholder_researcher", () =>
            runStakeholderResearcher(companyName)
          );
          await updateJobProgress(jobId, 60);

          return [triggers, painPoints, stakeholders] as const;
        }
      );

      // ============================
      // Phase 3: Synthesis (sequential — each builds on prior)
      // ============================

      const solutionMappings = await step.run("phase-3a-solution-mapper", async () => {
        const result = await runAgentStep(jobId, "solution_mapper", () =>
          runSolutionMapper({
            companyName,
            profile: {
              industry: profile.industry,
              subSector: profile.subSector,
              revenue: profile.revenue.value,
              employees: profile.employees.value,
              businessDescription: profile.businessDescription,
            },
            painPoints,
            techLandscape,
            financialSignals,
            triggers,
          })
        );
        await updateJobProgress(jobId, 70);
        return result;
      });

      const gtm = await step.run("phase-3b-gtm-generator", async () => {
        const result = await runAgentStep(jobId, "gtm_generator", () =>
          runGTMGenerator({
            companyName,
            profile: {
              industry: profile.industry,
              subSector: profile.subSector,
              revenue: profile.revenue.value,
              employees: profile.employees.value,
              hqCity: profile.hqCity,
              state: profile.state,
              businessDescription: profile.businessDescription,
            },
            techLandscape,
            financialSignals,
            triggers,
            painPoints,
            solutionMappings,
            stakeholders,
          })
        );
        await updateJobProgress(jobId, 80);
        return result;
      });

      const scores = await step.run("phase-3c-scoring", async () => {
        const result = await runAgentStep(jobId, "scoring_agent", () =>
          runScoringAgent({
            companyName,
            profile: {
              industry: profile.industry,
              revenue: profile.revenue.value,
              employees: profile.employees.value,
              businessDescription: profile.businessDescription,
            },
            techLandscape,
            financialSignals,
            triggers,
            painPoints,
            solutionMappings,
            gtm,
            stakeholders,
          })
        );
        await updateJobProgress(jobId, 90);
        return result;
      });

      // ============================
      // Phase 4: Verification + Assembly
      // ============================

      const totalScore =
        scores.budgetSignal.points +
        scores.solutionFit.points +
        scores.triggerRecency.points +
        scores.aiMaturity.points +
        scores.geminiAlignment.points;

      const rating = scoreToRating(totalScore);

      // Determine Gemini status from tech landscape
      const workspace = techLandscape.workspacePlatform?.value?.toLowerCase() || "";
      let geminiStatus: GeminiStatus = "explore";
      if (workspace.includes("google")) {
        geminiStatus = techLandscape.knownAIDeployments?.value?.some((d) =>
          d.toLowerCase().includes("gemini")
        )
          ? "expand"
          : "land";
      } else if (workspace.includes("microsoft")) {
        geminiStatus = "none";
      }

      // Collect all sources (cast needed: LLM output has string types, our Source type has literals)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allSources: any[] = [
        ...(profile.revenue.sources || []),
        ...(profile.employees.sources || []),
        ...(financialSignals.sources || []),
        ...triggers.flatMap((t: { sources?: unknown[] }) => t.sources || []),
        ...painPoints.flatMap((p: { sources?: unknown[] }) => p.sources || []),
        ...solutionMappings.flatMap((s: { sources?: unknown[] }) => s.sources || []),
        ...(gtm.sources || []),
        ...Object.values(scores).flatMap((d: unknown) => {
          const dim = d as { sources?: unknown[] };
          return dim.sources || [];
        }),
      ];

      // Deduplicate sources by URL
      const uniqueSources = Array.from(
        new Map(allSources.map((s: { url: string }) => [s.url, s])).values()
      );

      const primarySolution =
        solutionMappings.find((s: { priority: string }) => s.priority === "Primary")?.solution ||
        solutionMappings[0]?.solution ||
        "value-finder";

      // Cast to CompanyDetail — agent outputs match the schema but TS can't verify LLM string literals
      const assembledProfile = {
        slug: profile.slug,
        name: profile.name,
        fullName: profile.fullName,
        industry: profile.industry,
        subSector: profile.subSector,
        hqCity: profile.hqCity,
        state: profile.state,
        revenue: profile.revenue,
        employees: profile.employees,
        businessDescription: profile.businessDescription,
        execSummary: profile.execSummary,
        triggerEvents: triggers,
        painPoints,
        techLandscape,
        solutionMappings,
        gtm,
        scores,
        totalScore,
        rating,
        geminiStatus,
        stakeholders,
        relatedCompanies: [],
        sources: uniqueSources,
        generatedDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      } as unknown as CompanyDetail;

      // Run verification
      const { correctedProfile } = await step.run(
        "phase-4-verification",
        async () => {
          const result = await runAgentStep(jobId, "verification", () =>
            runVerification(assembledProfile)
          );
          await updateJobProgress(jobId, 95);
          return result;
        }
      );

      // ============================
      // Save to database
      // ============================

      await step.run("save-profile", async () => {
        const { data: job } = await supabase
          .from("research_jobs")
          .select("project_id, user_id")
          .eq("id", jobId)
          .single();

        if (!job) throw new Error(`Job ${jobId} not found`);

        await supabase.from("company_profiles").upsert(
          {
            job_id: jobId,
            project_id: job.project_id,
            user_id: job.user_id,
            slug: correctedProfile.slug,
            data: correctedProfile as unknown as Record<string, unknown>,
            total_score: correctedProfile.totalScore,
            rating: correctedProfile.rating,
            industry: correctedProfile.industry,
            urgency: correctedProfile.gtm.urgency,
            primary_solution: primarySolution,
            gemini_status: correctedProfile.geminiStatus,
          },
          { onConflict: "project_id,slug" }
        );

        // Mark job complete
        await supabase
          .from("research_jobs")
          .update({
            status: "completed",
            progress: 100,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      });

      return { success: true, slug: correctedProfile.slug, rating: correctedProfile.rating };
    } catch (error) {
      // Mark job as failed
      await supabase
        .from("research_jobs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      throw error;
    }
  }
);
