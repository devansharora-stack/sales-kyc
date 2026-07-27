/**
 * Portfolio-GTM Inngest function. Triggered by `portfolio/gtm.start` {projectId}.
 * Loads every completed company profile in the project, runs the portfolio-rollup
 * agent, and writes the result + status back onto the projects row.
 */

import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { projects, companyProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runPortfolioGTMGenerator } from "./portfolio-gtm-generator";
import type { CompanyDetail } from "@/lib/types";

export const generatePortfolioGTM = inngest.createFunction(
  {
    id: "generate-portfolio-gtm",
    retries: 1,
    concurrency: [{ limit: 2 }],
    triggers: [{ event: "portfolio/gtm.start" }],
  },
  async ({ event }: { event: { data: { projectId: string } } }) => {
    const { projectId } = event.data;

    await db
      .update(projects)
      .set({ portfolioGtmStatus: "running", portfolioGtmError: null })
      .where(eq(projects.id, projectId));

    try {
      const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));
      if (!proj) throw new Error("Project not found");

      const rows = await db
        .select({ data: companyProfiles.data })
        .from(companyProfiles)
        .where(eq(companyProfiles.projectId, projectId));
      const companies = rows.map((r) => r.data as CompanyDetail).filter((c): c is CompanyDetail => !!c && !!c.name);

      if (companies.length < 2) {
        throw new Error(`Need at least 2 completed company profiles to roll up (found ${companies.length}).`);
      }

      const gtm = await runPortfolioGTMGenerator(proj.name, companies);

      await db
        .update(projects)
        .set({ portfolioGtm: gtm, portfolioGtmStatus: "completed", portfolioGtmAt: new Date(), portfolioGtmError: null })
        .where(eq(projects.id, projectId));

      return { ok: true, accounts: companies.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(projects)
        .set({ portfolioGtmStatus: "failed", portfolioGtmError: message })
        .where(eq(projects.id, projectId));
      throw err;
    }
  },
);
