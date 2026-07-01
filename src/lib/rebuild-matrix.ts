import { db } from "@/lib/db";
import { companyProfiles, stakeholderProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runStakeholderOfferingMapper } from "@/agents/stakeholder-offering-mapper";
import { normalizeStakeholderName, formatStakeholderName } from "@/lib/names";
import type { CompanyDetail, DeepStakeholderProfile, StakeholderIntelBrief, Stakeholder } from "@/lib/types";

/**
 * Rebuild a company's Stakeholder × Offering matrix using any completed deep
 * stakeholder profiles in the same project. Called after a deep research run
 * finishes so the matrix reflects the richer, verified intel. Best-effort:
 * returns false (without throwing) when there's nothing to (re)build.
 */
export async function rebuildStakeholderOfferingMatrix(companyProfileId: string): Promise<boolean> {
  const [cp] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyProfileId));
  if (!cp || !cp.projectId) return false;

  const data = (cp.data || {}) as Partial<CompanyDetail>;
  const stakeholders = data.stakeholders || [];
  const solutionMappings = data.solutionMappings || [];
  // Need solution columns to build a matrix; stakeholders can come from either
  // the AI list or manually-added analyzed people (handled below).
  if (solutionMappings.length === 0) return false;

  // Completed deep profiles for this project, reduced to name → intel brief.
  const rows = await db
    .select()
    .from(stakeholderProfiles)
    .where(
      and(
        eq(stakeholderProfiles.projectId, cp.projectId),
        eq(stakeholderProfiles.status, "completed"),
      ),
    );

  const deepProfiles = rows
    .map((r) => {
      const profile = (r.data as { profile?: DeepStakeholderProfile } | null)?.profile;
      return profile?.intelBrief ? { name: r.name, intelBrief: profile.intelBrief } : null;
    })
    .filter((x): x is { name: string; intelBrief: StakeholderIntelBrief } => x !== null);

  // Manually-added, analyzed people for THIS company who aren't in the AI list —
  // promote them into the mapper input so they get their own matrix rows (with
  // cells grounded in their deep intel, which is already passed via deepProfiles).
  const existingNames = new Set(stakeholders.map((s) => normalizeStakeholderName(s.name)));
  const manualStakeholders: Stakeholder[] = rows
    .filter(
      (r) =>
        r.inputType === "manual" &&
        r.companyProfileId === companyProfileId &&
        !existingNames.has(normalizeStakeholderName(r.name)),
    )
    .map((r) => {
      const profile = (r.data as { profile?: DeepStakeholderProfile } | null)?.profile;
      const brief = profile?.intelBrief;
      return {
        name: formatStakeholderName(r.name),
        title: r.title || profile?.headline || "",
        tier: brief?.tier || "Influencer",
        relevance: brief?.keyInsight || brief?.executiveSummary || "",
        source: "Manually added",
        sourceUrl: r.linkedinUrl || "",
        confidence: "verified",
      } as Stakeholder;
    });

  const allStakeholders = [...stakeholders, ...manualStakeholders];
  // Nothing new to (re)build on: no deep intel and no manual additions.
  if (allStakeholders.length === 0 || (deepProfiles.length === 0 && manualStakeholders.length === 0)) return false;

  const matrix = await runStakeholderOfferingMapper({
    companyName: data.name || data.fullName || "",
    profile: {
      industry: data.industry || "",
      subSector: data.subSector || "",
      businessDescription: data.businessDescription || "",
    },
    stakeholders: allStakeholders,
    solutionMappings,
    painPoints: data.painPoints || [],
    gtm: (data.gtm || {}) as CompanyDetail["gtm"],
    deepProfiles,
  });

  await db
    .update(companyProfiles)
    .set({
      data: { ...data, stakeholderOfferingMatrix: matrix } as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(companyProfiles.id, companyProfileId));

  return true;
}
