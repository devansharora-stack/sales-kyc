import { db } from "@/lib/db";
import { companyProfiles, stakeholderProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runStakeholderOfferingMapper } from "@/agents/stakeholder-offering-mapper";
import type { CompanyDetail, DeepStakeholderProfile, StakeholderIntelBrief } from "@/lib/types";

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
  if (stakeholders.length === 0 || solutionMappings.length === 0) return false;

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

  if (deepProfiles.length === 0) return false;

  const matrix = await runStakeholderOfferingMapper({
    companyName: data.name || data.fullName || "",
    profile: {
      industry: data.industry || "",
      subSector: data.subSector || "",
      businessDescription: data.businessDescription || "",
    },
    stakeholders,
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
