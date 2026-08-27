import { db } from "@/lib/db";
import { companyProfiles } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import type { CompanyDetail } from "@/lib/types";

// Minimum peers required before we make a comparative claim.
const MIN_PEERS = 2;

function maturityRatio(c: Partial<CompanyDetail> | undefined): number | null {
  const dim = c?.scores?.aiMaturity;
  if (!dim || !dim.maxPoints) return null;
  return dim.points / dim.maxPoints;
}

// Builds a comparative peer-benchmark line from OTHER companies we've researched
// in the same project. Prefers same-subSector peers; falls back to same-industry.
// Returns undefined when there aren't enough peers to make an honest claim —
// callers should fall back to a soft self-band.
export async function computePeerBenchmark(
  projectId: string,
  selfId: string,
  self: CompanyDetail
): Promise<string | undefined> {
  const selfRatio = maturityRatio(self);
  if (selfRatio == null) return undefined;

  const rows = await db
    .select({ data: companyProfiles.data, industry: companyProfiles.industry })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.projectId, projectId), ne(companyProfiles.id, selfId)));

  const peers = rows.map((r) => ({
    d: (r.data || {}) as Partial<CompanyDetail>,
    industry: r.industry,
  }));

  // Prefer subSector cohort, else industry cohort.
  const bySub = peers.filter((p) => self.subSector && p.d.subSector === self.subSector);
  const cohort = bySub.length >= MIN_PEERS ? bySub : peers.filter((p) => self.industry && (p.d.industry || p.industry) === self.industry);
  const label = bySub.length >= MIN_PEERS ? self.subSector : self.industry;

  const ratios = cohort.map((p) => maturityRatio(p.d)).filter((r): r is number => r != null);
  if (ratios.length < MIN_PEERS) return undefined;

  // Percentile: share of peers this company is more automation-mature than.
  const below = ratios.filter((r) => r < selfRatio).length;
  const pct = Math.round((below / ratios.length) * 100);
  const cohortLabel = label ? `${label} peers` : "peers";
  const n = ratios.length;

  if (pct >= 60) return `Automation maturity: ahead of ${pct}% of the ${n} ${cohortLabel} we've analyzed.`;
  if (pct <= 40) return `Automation maturity: behind ${100 - pct}% of the ${n} ${cohortLabel} we've analyzed — room to move fast.`;
  return `Automation maturity: mid-pack among the ${n} ${cohortLabel} we've analyzed.`;
}
