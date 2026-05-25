/**
 * Verification Agent — Phase 4
 * Quality gate: structural validation + source URL liveness checks.
 *
 * Layers (fast — no LLM calls):
 * 1. Structural validation (TypeScript) — score math, ranges, required fields
 * 2. Source URL liveness check (HEAD requests in parallel) — strips dead URLs
 * 3. Stakeholder URL liveness check (HEAD requests in parallel)
 * 4. Content quality heuristics (code-based, no LLM)
 */

import type { CompanyDetail, Source, GeminiStatus } from "@/lib/types";
import { scoreToRating } from "@/lib/types";

interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixes: { field: string; current: unknown; corrected: unknown; reason: string }[];
  qualityScore: number;
}

/**
 * Quick URL liveness check — HEAD request with short timeout.
 * Trusted grounding URLs (vertexaisearch.*) are auto-approved.
 */
async function isUrlLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KYCGenie/1.0)" },
    });
    return res.ok || res.status === 403 || res.status === 401;
  } catch {
    // For Vertex AI redirect URLs, try GET as fallback (some reject HEAD)
    if (url.includes("vertexaisearch.cloud.google.com")) {
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; KYCGenie/1.0)" },
        });
        return res.ok || res.status === 403 || res.status === 401;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ─── Main verification function ───

export async function runVerification(profile: CompanyDetail): Promise<{
  result: VerificationResult;
  correctedProfile: CompanyDetail;
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixes: VerificationResult["fixes"] = [];
  const corrected = structuredClone(profile);

  // ========================================
  // Layer 1: Structural validation (TypeScript)
  // ========================================

  // Score math
  const calculatedTotal =
    (profile.scores.budgetSignal?.points || 0) +
    (profile.scores.solutionFit?.points || 0) +
    (profile.scores.triggerRecency?.points || 0) +
    (profile.scores.aiMaturity?.points || 0) +
    (profile.scores.geminiAlignment?.points || 0);

  if (profile.totalScore !== calculatedTotal) {
    fixes.push({
      field: "totalScore",
      current: profile.totalScore,
      corrected: calculatedTotal,
      reason: `Sum of dimensions is ${calculatedTotal}, not ${profile.totalScore}`,
    });
    corrected.totalScore = calculatedTotal;
  }

  const expectedRating = scoreToRating(corrected.totalScore);
  if (profile.rating !== expectedRating) {
    fixes.push({
      field: "rating",
      current: profile.rating,
      corrected: expectedRating,
      reason: `Score ${corrected.totalScore} maps to ${expectedRating}, not ${profile.rating}`,
    });
    corrected.rating = expectedRating;
  }

  const ranges: Record<string, number> = {
    budgetSignal: 25, solutionFit: 25, triggerRecency: 20, aiMaturity: 15, geminiAlignment: 15,
  };
  for (const [dim, max] of Object.entries(ranges)) {
    const score = profile.scores[dim as keyof typeof profile.scores];
    if (score && (score.points < 0 || score.points > max)) {
      errors.push(`${dim} score ${score.points} is out of range [0, ${max}]`);
    }
  }

  if (!profile.triggerEvents?.length) warnings.push("No trigger events found");
  if (!profile.painPoints?.length) errors.push("No pain points identified");
  if (!profile.solutionMappings?.length) errors.push("No solution mappings created");
  if (!profile.stakeholders?.length) warnings.push("No stakeholders identified");

  // Gemini status alignment
  const workspace = profile.techLandscape?.workspacePlatform?.value?.toLowerCase() || "";
  let expectedGemini: GeminiStatus = "explore";
  if (workspace.includes("google")) {
    expectedGemini = profile.techLandscape.knownAIDeployments?.value?.some(
      (d) => d.toLowerCase().includes("gemini")
    )
      ? "expand"
      : "land";
  } else if (workspace.includes("microsoft")) {
    expectedGemini = "none";
  }
  if (profile.geminiStatus !== expectedGemini) {
    fixes.push({
      field: "geminiStatus",
      current: profile.geminiStatus,
      corrected: expectedGemini,
      reason: `Workspace "${workspace}" maps to geminiStatus "${expectedGemini}"`,
    });
    corrected.geminiStatus = expectedGemini;
  }

  // GTM entry solution should be Primary
  const primarySolutions = profile.solutionMappings
    ?.filter((s) => s.priority === "Primary")
    .map((s) => s.solution);
  if (
    profile.gtm?.entrySolution &&
    primarySolutions?.length &&
    !primarySolutions.includes(profile.gtm.entrySolution)
  ) {
    warnings.push(`GTM entrySolution "${profile.gtm.entrySolution}" is not a Primary-priority solution`);
  }

  if (profile.stakeholders?.length && !profile.stakeholders.some((s) => s.tier === "Decision Maker")) {
    warnings.push("No Decision Maker tier stakeholder identified");
  }

  // ========================================
  // Layer 2: Source URL liveness (parallel HEAD requests)
  // ========================================

  // Collect ALL unique source URLs from every section (not just top-level)
  const allUrlSet = new Set<string>();
  const collectUrls = (sources: Source[] | undefined) => {
    for (const s of sources || []) if (s.url) allUrlSet.add(s.url);
  };
  collectUrls(corrected.sources);
  for (const t of corrected.triggerEvents || []) collectUrls(t.sources);
  for (const p of corrected.painPoints || []) collectUrls(p.sources);
  for (const s of corrected.solutionMappings || []) collectUrls(s.sources);
  if (corrected.gtm?.sources) collectUrls(corrected.gtm.sources);
  for (const dim of Object.values(corrected.scores)) {
    const d = dim as { sources?: Source[] };
    if (d?.sources) collectUrls(d.sources);
  }

  const allUniqueUrls = Array.from(allUrlSet);
  if (allUniqueUrls.length > 0) {
    // Check in batches of 15 to avoid overwhelming the network
    const deadUrls = new Set<string>();
    const BATCH_SIZE = 15;
    for (let i = 0; i < allUniqueUrls.length; i += BATCH_SIZE) {
      const batch = allUniqueUrls.slice(i, i + BATCH_SIZE);
      const liveChecks = await Promise.allSettled(
        batch.map(async (url) => ({ url, live: await isUrlLive(url) }))
      );
      for (const check of liveChecks) {
        if (check.status === "fulfilled" && !check.value.live) {
          deadUrls.add(check.value.url);
        }
      }
    }

    if (deadUrls.size > 0) {
      // Strip dead sources from ALL sections
      const stripDead = (sources: Source[] | undefined): Source[] =>
        (sources || []).filter((s) => !deadUrls.has(s.url));

      corrected.sources = stripDead(corrected.sources);
      for (const t of corrected.triggerEvents || []) t.sources = stripDead(t.sources);
      for (const p of corrected.painPoints || []) p.sources = stripDead(p.sources);
      for (const s of corrected.solutionMappings || []) s.sources = stripDead(s.sources);
      if (corrected.gtm?.sources) corrected.gtm.sources = stripDead(corrected.gtm.sources);
      for (const dim of Object.values(corrected.scores)) {
        const d = dim as { sources?: Source[] };
        if (d?.sources) d.sources = stripDead(d.sources);
      }

      fixes.push({
        field: "sources",
        current: `${allUniqueUrls.length} unique URLs checked`,
        corrected: `${allUniqueUrls.length - deadUrls.size} live, ${deadUrls.size} dead stripped`,
        reason: "Stripped dead source URLs",
      });
      warnings.push(`${deadUrls.size} dead source URL(s) removed`);
    }
  }

  // ========================================
  // Layer 3: Stakeholder URL liveness (parallel)
  // ========================================

  if (corrected.stakeholders?.length) {
    const stakeholderChecks = await Promise.allSettled(
      corrected.stakeholders.map(async (s) => ({
        name: s.name,
        live: s.sourceUrl ? await isUrlLive(s.sourceUrl) : false,
      }))
    );

    let verifiedCount = 0;
    let unverifiedCount = 0;
    for (let i = 0; i < corrected.stakeholders.length; i++) {
      const check = stakeholderChecks[i];
      const live = check.status === "fulfilled" && check.value.live;
      corrected.stakeholders[i].confidence = live ? "verified" : "likely";
      if (live) verifiedCount++;
      else unverifiedCount++;
    }

    if (unverifiedCount > 0) {
      warnings.push(`${unverifiedCount} stakeholder source URL(s) not reachable — marked as "likely"`);
    }

    fixes.push({
      field: "stakeholders",
      current: `${corrected.stakeholders.length} stakeholders`,
      corrected: `${verifiedCount} verified, ${unverifiedCount} likely`,
      reason: "Checked stakeholder source URL liveness",
    });
  }

  // ========================================
  // Layer 4: Content quality heuristics (no LLM)
  // ========================================

  let qualityScore = 100;
  const profileJson = JSON.stringify(corrected).toLowerCase();

  // Check for fabrication patterns
  const fabricationPatterns = [
    "fortune 500 company", "fortune 100 company", "leading enterprise",
    "global enterprise achieved", "major corporation", "unnamed client",
    "similar company", "a leading company", "a major company",
  ];
  for (const pattern of fabricationPatterns) {
    if (profileJson.includes(pattern)) {
      warnings.push(`Possible fabrication: "${pattern}" found in output`);
      qualityScore -= 10;
    }
  }

  // Deductions for missing data
  if (!profile.triggerEvents?.length) qualityScore -= 10;
  if (!profile.stakeholders?.length) qualityScore -= 10;
  if ((corrected.sources || []).length < 3) { qualityScore -= 10; warnings.push("Very few source URLs"); }
  if (!profile.gtm?.brief) qualityScore -= 5;
  if (!profile.solutionMappings?.some((s) => s.proofPoint?.client)) {
    qualityScore -= 10;
    warnings.push("No proof points with named clients");
  }

  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return {
    result: {
      valid: errors.length === 0,
      errors,
      warnings,
      fixes,
      qualityScore,
    },
    correctedProfile: corrected,
  };
}
