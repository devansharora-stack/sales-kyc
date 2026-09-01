import { db } from "@/lib/db";
import { companyProfiles, stakeholderProfiles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { matchCompany, matchStakeholder, type MatchCandidate, type StakeholderCandidate } from "@/lib/company-match";
import type { CompanyDetail, DeepStakeholderProfile, StakeholderScriptSet } from "@/lib/types";

export type CompanyRow = {
  id: string;
  projectId: string | null;
  jobId: string | null;
  slug: string;
  data: CompanyDetail;
  geminiStatus: string | null;
  updatedAt: Date | null;
};

// Cross-project pool of researched companies. The CRM doesn't know or care which
// project a company was researched under, so we match against ALL of them and
// return the newest hit. `matchType` mirrors the app's dedup logic (domain →
// exact → fuzzy) so "Darling" resolves to "Darling Ingredients" etc.
async function loadCompanyPool(limit = 1000): Promise<CompanyRow[]> {
  const rows = await db
    .select({
      id: companyProfiles.id,
      projectId: companyProfiles.projectId,
      jobId: companyProfiles.jobId,
      slug: companyProfiles.slug,
      data: companyProfiles.data,
      geminiStatus: companyProfiles.geminiStatus,
      updatedAt: companyProfiles.updatedAt,
    })
    .from(companyProfiles)
    .orderBy(desc(companyProfiles.updatedAt))
    .limit(limit);
  return rows as CompanyRow[];
}

/** Resolve a company by name/domain across every project. Newest match wins. */
export async function resolveCompany(
  name: string | undefined,
  domain: string | undefined
): Promise<{ row: CompanyRow; matchType: string } | null> {
  const pool = await loadCompanyPool();
  // Newest row per slug (pool is already newest-first).
  const bySlug = new Map<string, CompanyRow>();
  for (const r of pool) if (!bySlug.has(r.slug)) bySlug.set(r.slug, r);
  const candidates: MatchCandidate[] = [...bySlug.values()].map((r) => ({
    slug: r.slug,
    name: r.data?.name ?? null,
    domain: r.data?.domain ?? null,
  }));
  const match = matchCompany(name ?? "", domain, candidates);
  if (!match) return null;
  const row = bySlug.get(match.slug);
  return row ? { row, matchType: match.matchType } : null;
}

/** Resolve a company profile directly by slug (newest across projects). */
export async function resolveCompanyBySlug(slug: string, projectId?: string): Promise<CompanyRow | null> {
  const pool = await loadCompanyPool();
  const row = pool.find((r) => r.slug === slug && (!projectId || r.projectId === projectId));
  return row ?? null;
}

export type StakeholderRow = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  linkedinUrl: string | null;
  status: string;
  data: { profile?: DeepStakeholderProfile; scripts?: StakeholderScriptSet } | null;
};

/** Resolve one stakeholder under a company profile by name / LinkedIn URL. */
export async function resolveStakeholder(
  companyProfileId: string,
  contact: { name: string; company?: string | null; linkedinUrl?: string | null }
): Promise<{ row: StakeholderRow; matchType: string } | null> {
  const rows = (await db
    .select({
      id: stakeholderProfiles.id,
      name: stakeholderProfiles.name,
      company: stakeholderProfiles.company,
      title: stakeholderProfiles.title,
      linkedinUrl: stakeholderProfiles.linkedinUrl,
      status: stakeholderProfiles.status,
      data: stakeholderProfiles.data,
    })
    .from(stakeholderProfiles)
    .where(eq(stakeholderProfiles.companyProfileId, companyProfileId))) as StakeholderRow[];

  const candidates: StakeholderCandidate[] = rows.map((r) => ({
    key: r.id,
    name: r.name,
    company: r.company,
    linkedinUrl: r.linkedinUrl,
  }));
  const match = matchStakeholder(contact, candidates);
  if (!match) return null;
  const row = rows.find((r) => r.id === match.key);
  return row ? { row, matchType: match.matchType } : null;
}

// ─── Prep-sheet assembly (deterministic, no LLM) ────────────────────────────
// Reformats research we already hold into a contact-specific meeting brief. An
// LLM-tailored variant can be layered behind a flag later; the shape stays the
// same so the CRM integration doesn't have to change.

export function buildPrepSheet(company: CompanyDetail, stakeholder?: StakeholderRow) {
  const brief = stakeholder?.data?.profile?.intelBrief;
  const scripts = stakeholder?.data?.scripts;

  // Matrix row for this person → which offerings map to them and how.
  const matrixRow = stakeholder
    ? company.stakeholderOfferingMatrix?.rows.find(
        (r) => r.stakeholderName?.toLowerCase() === stakeholder.name.toLowerCase()
      )
    : undefined;

  // Recommended solutions: prefer the matrix (person-specific), else the
  // company's primary/secondary solution mappings.
  const recommendedSolutions = matrixRow
    ? matrixRow.cells
        .filter((c) => c.strength === "strong" || c.strength === "conditional")
        .map((c) => ({
          solution: c.solutionName,
          role: c.role,
          strength: c.strength,
          rationale: c.rationale,
        }))
    : company.solutionMappings
        .filter((m) => m.priority === "Primary" || m.priority === "Secondary")
        .map((m) => ({
          solution: m.solutionName,
          painPoint: m.painPoint,
          value: m.value,
          proofPoint: m.proofPoint,
        }));

  return {
    person: stakeholder
      ? {
          name: stakeholder.name,
          title: stakeholder.title ?? null,
          linkedinUrl: stakeholder.linkedinUrl,
          tier: brief?.tier ?? null,
          researched: stakeholder.status === "completed" && !!brief,
        }
      : null,
    // Persona is null when the person isn't deep-researched yet — the CRM can
    // still use companyContext + recommendedSolutions.
    persona: brief
      ? {
          executiveSummary: brief.executiveSummary,
          keyInsight: brief.keyInsight,
          careerNarrative: brief.careerNarrative,
          verifiedPriorities: brief.verifiedPriorities,
          painPoints: brief.painPoints,
        }
      : null,
    engagement: brief?.engagementApproach ?? null,
    companyContext: {
      name: company.name,
      fullName: company.fullName,
      industry: company.industry,
      execSummary: company.execSummary,
      topPainPoints: (company.painPoints || [])
        .slice(0, 5)
        .map((p) => ({ title: p.title, severity: p.severity, description: p.description })),
      entrySolution: company.gtm?.entrySolution ?? null,
    },
    recommendedSolutions,
    scripts: scripts
      ? {
          offeringName: scripts.offeringName,
          predictedTone: scripts.predictedTone,
          leaveBehind: scripts.variants?.[0]?.leaveBehind ?? null,
          tones: scripts.variants?.map((v) => v.toneLabel) ?? [],
        }
      : null,
  };
}
