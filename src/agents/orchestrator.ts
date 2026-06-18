/**
 * Research Pipeline Orchestrator
 *
 * Inngest step function that coordinates the 4-phase agent pipeline
 * for a single company. Each agent runs as an Inngest step with
 * automatic retries. Progress is written to Supabase so the
 * frontend can subscribe via Realtime.
 */

import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { researchJobs, researchSteps, companyProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
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
import { runSalesIntelligence } from "./sales-intelligence";

// Helper: update a research step's status
async function updateStep(
  jobId: string,
  agentName: string,
  update: Partial<typeof researchSteps.$inferInsert>
) {
  await db
    .update(researchSteps)
    .set(update)
    .where(and(eq(researchSteps.jobId, jobId), eq(researchSteps.agentName, agentName)));
}

// Helper: update research job progress
async function updateJobProgress(jobId: string, progress: number) {
  await db.update(researchJobs).set({ progress }).where(eq(researchJobs.id, jobId));
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
    startedAt: new Date(),
  });

  try {
    const result = await fn();
    await updateStep(jobId, agentName, {
      status: "completed",
      output: result as Record<string, unknown>,
      completedAt: new Date(),
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    await updateStep(jobId, agentName, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

export const researchCompany = inngest.createFunction(
  {
    id: "research-company",
    retries: 0,
    concurrency: [{ limit: 5 }],
    triggers: [{ event: "research/company.start" }],
  },
  async ({ event, step }: { event: { data: { jobId: string; companyName: string; companyContext?: Record<string, string> } }; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { jobId, companyName, companyContext } = event.data;

    // Mark job as running
    await db
      .update(researchJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(researchJobs.id, jobId));

    // Safe field accessors — LLM output may omit fields
    const safe = (val: unknown, fallback = "Unknown") => (val as string) || fallback;
    const safeNum = (val: unknown, fallback = 0) => (typeof val === "number" ? val : fallback);

    try {
      // ============================
      // Phase 1: Foundation — all 3 Gemini agents run in PARALLEL
      // (Profile, Tech Stack, Financial Signal are fully independent)
      // ============================

      const phase1 = await step.run("phase-1-foundation-parallel", async () => {
        const [profile, techLandscape, financialSignals] = await Promise.all([
          runAgentStep(jobId, "company_profile", () =>
            runCompanyProfile(companyName, companyContext)
          ),
          runAgentStep(jobId, "tech_stack", () =>
            runTechStack(companyName)
          ),
          runAgentStep(jobId, "financial_signal", () =>
            runFinancialSignal(companyName)
          ),
        ]);
        await updateJobProgress(jobId, 30);
        return { profile, techLandscape, financialSignals };
      });

      const { profile, techLandscape, financialSignals } = phase1;

      // ============================
      // Phase 2: Intelligence
      // Trigger Scanner + Stakeholders run in PARALLEL (both independent)
      // Pain Points runs after triggers (it depends on trigger output)
      // ============================

      const phase2a = await step.run("phase-2a-triggers-and-stakeholders-parallel", async () => {
        const [triggers, stakeholders] = await Promise.all([
          runAgentStep(jobId, "trigger_scanner", () =>
            runTriggerScanner({
              companyName,
              profile: {
                industry: safe(profile.industry),
                revenue: safe(profile.revenue?.value),
                employees: safe(profile.employees?.value),
                businessDescription: safe(profile.businessDescription),
              },
            })
          ),
          runAgentStep(jobId, "stakeholder_researcher", () =>
            runStakeholderResearcher(companyName)
          ),
        ]);
        await updateJobProgress(jobId, 45);
        return { triggers, stakeholders };
      });

      const { triggers, stakeholders } = phase2a;

      const painPoints = await step.run("phase-2b-pain-points", async () => {
        const result = await runAgentStep(jobId, "pain_point_analyzer", () =>
          runPainPointAnalyzer({
            companyName,
            profile: {
              industry: safe(profile.industry),
              subSector: safe(profile.subSector),
              revenue: safe(profile.revenue?.value),
              employees: safe(profile.employees?.value),
              businessDescription: safe(profile.businessDescription),
            },
            triggers: Array.isArray(triggers) ? triggers : [],
            techLandscape,
            financialSignals,
          })
        );
        await updateJobProgress(jobId, 55);
        return result;
      });

      // Ensure painPoints is always an array
      const safePainPoints = Array.isArray(painPoints) ? painPoints : [];

      // ============================
      // Phase 3: Synthesis (sequential — each builds on prior)
      // ============================

      const solutionMappings = await step.run("phase-3a-solution-mapper", async () => {
        const result = await runAgentStep(jobId, "solution_mapper", () =>
          runSolutionMapper({
            companyName,
            profile: {
              industry: safe(profile.industry),
              subSector: safe(profile.subSector),
              revenue: safe(profile.revenue?.value),
              employees: safe(profile.employees?.value),
              businessDescription: safe(profile.businessDescription),
            },
            painPoints: safePainPoints,
            techLandscape,
            financialSignals,
            triggers: Array.isArray(triggers) ? triggers : [],
          })
        );
        await updateJobProgress(jobId, 70);
        return result;
      });

      const safeSolutionMappings = Array.isArray(solutionMappings) ? solutionMappings : [];

      const gtm = await step.run("phase-3b-gtm-generator", async () => {
        const result = await runAgentStep(jobId, "gtm_generator", () =>
          runGTMGenerator({
            companyName,
            profile: {
              industry: safe(profile.industry),
              subSector: safe(profile.subSector),
              revenue: safe(profile.revenue?.value),
              employees: safe(profile.employees?.value),
              hqCity: safe(profile.hqCity),
              state: safe(profile.state),
              businessDescription: safe(profile.businessDescription),
            },
            techLandscape,
            financialSignals,
            triggers: Array.isArray(triggers) ? triggers : [],
            painPoints: safePainPoints,
            solutionMappings: safeSolutionMappings,
            stakeholders,
          })
        );
        await updateJobProgress(jobId, 80);
        return result;
      });

      const phase3c = await step.run("phase-3c-scoring-and-sales-intel", async () => {
        const [scores, salesIntelligence] = await Promise.all([
          runAgentStep(jobId, "scoring_agent", () =>
            runScoringAgent({
              companyName,
              profile: {
                industry: safe(profile.industry),
                revenue: safe(profile.revenue?.value),
                employees: safe(profile.employees?.value),
                businessDescription: safe(profile.businessDescription),
              },
              techLandscape,
              financialSignals,
              triggers: Array.isArray(triggers) ? triggers : [],
              painPoints: safePainPoints,
              solutionMappings: safeSolutionMappings,
              gtm,
              stakeholders,
            })
          ),
          runAgentStep(jobId, "sales_intelligence", () =>
            runSalesIntelligence({
              companyName,
              profile: {
                industry: safe(profile.industry),
                revenue: safe(profile.revenue?.value),
                employees: safe(profile.employees?.value),
                businessDescription: safe(profile.businessDescription),
              },
              solutionMappings: safeSolutionMappings,
              gtm,
              stakeholders,
            })
          ),
        ]);
        await updateJobProgress(jobId, 90);
        return { scores, salesIntelligence };
      });

      const { scores, salesIntelligence } = phase3c;

      // ============================
      // Phase 4: Verification + Assembly
      // ============================

      const totalScore =
        safeNum(scores?.budgetSignal?.points) +
        safeNum(scores?.solutionFit?.points) +
        safeNum(scores?.triggerRecency?.points) +
        safeNum(scores?.aiMaturity?.points) +
        safeNum(scores?.geminiAlignment?.points);

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

      // Collect ALL sources from every section
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allSources: any[] = [
        // Company profile
        ...(profile.revenue?.sources || []),
        ...(profile.employees?.sources || []),
        // Financial signals
        ...(financialSignals?.sources || []),
        // Tech landscape (all 5 fields)
        ...(techLandscape?.cloudProviders?.sources || []),
        ...(techLandscape?.workspacePlatform?.sources || []),
        ...(techLandscape?.knownAIDeployments?.sources || []),
        ...(techLandscape?.knownVendors?.sources || []),
        ...(techLandscape?.knownSystems?.sources || []),
        // Triggers
        ...(Array.isArray(triggers) ? triggers : []).flatMap((t: { sources?: unknown[] }) => t.sources || []),
        // Pain points
        ...safePainPoints.flatMap((p: { sources?: unknown[] }) => p.sources || []),
        // Solution mappings (including estimatedImpact sources)
        ...safeSolutionMappings.flatMap((s: { sources?: unknown[]; estimatedImpact?: unknown }) => {
          const sources = [...(s.sources || [])];
          if (s.estimatedImpact && typeof s.estimatedImpact === "object") {
            const imp = s.estimatedImpact as { sources?: unknown[] };
            sources.push(...(imp.sources || []));
          }
          return sources;
        }),
        // GTM (all section sources)
        ...(gtm?.sources || []),
        ...(gtm?.briefSources || []),
        ...(gtm?.entrySolutionSources || []),
        ...(gtm?.urgencySources || []),
        ...(gtm?.competitiveSources || []),
        // Scores
        ...Object.values(scores || {}).flatMap((d: unknown) => {
          const dim = d as { sources?: unknown[] };
          return dim?.sources || [];
        }),
      ];

      // Deduplicate sources by URL
      const uniqueSources = Array.from(
        new Map(allSources.filter((s: { url?: string }) => s?.url).map((s: { url: string }) => [s.url, s])).values()
      );

      const primarySolution =
        safeSolutionMappings.find((s: { priority: string }) => s.priority === "Primary")?.solution ||
        safeSolutionMappings[0]?.solution ||
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
        triggerEvents: Array.isArray(triggers) ? triggers : [],
        painPoints: safePainPoints,
        techLandscape,
        solutionMappings: safeSolutionMappings,
        gtm: gtm || {},
        scores,
        totalScore,
        rating,
        geminiStatus,
        stakeholders,
        salesIntelligence: salesIntelligence || undefined,
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
        const [job] = await db
          .select({ projectId: researchJobs.projectId, userId: researchJobs.userId })
          .from(researchJobs)
          .where(eq(researchJobs.id, jobId));

        if (!job) throw new Error(`Job ${jobId} not found`);

        await db
          .insert(companyProfiles)
          .values({
            jobId,
            projectId: job.projectId,
            userId: job.userId,
            slug: correctedProfile.slug,
            data: correctedProfile as unknown as Record<string, unknown>,
            totalScore: correctedProfile.totalScore,
            rating: correctedProfile.rating,
            industry: correctedProfile.industry,
            urgency: correctedProfile.gtm?.urgency || "medium",
            primarySolution: primarySolution,
            geminiStatus: correctedProfile.geminiStatus,
          })
          .onConflictDoUpdate({
            target: [companyProfiles.projectId, companyProfiles.slug],
            set: {
              jobId,
              userId: job.userId,
              data: correctedProfile as unknown as Record<string, unknown>,
              totalScore: correctedProfile.totalScore,
              rating: correctedProfile.rating,
              industry: correctedProfile.industry,
              urgency: correctedProfile.gtm?.urgency || "medium",
              primarySolution: primarySolution,
              geminiStatus: correctedProfile.geminiStatus,
              updatedAt: new Date(),
            },
          });

        // Mark job complete
        await db
          .update(researchJobs)
          .set({ status: "completed", progress: 100, completedAt: new Date() })
          .where(eq(researchJobs.id, jobId));
      });

      return { success: true, slug: correctedProfile.slug, rating: correctedProfile.rating };
    } catch (error) {
      // Mark job as failed
      await db
        .update(researchJobs)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        })
        .where(eq(researchJobs.id, jobId));

      throw error;
    }
  }
);
