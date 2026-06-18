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
/**
 * URL liveness result:
 * - "live"    → confirmed reachable (2xx, 403, 401)
 * - "dead"    → confirmed dead (404, 410)
 * - "unknown" → can't determine (timeout, SSL error, connection refused)
 *               These are kept — don't strip URLs just because a server blocks bots.
 */
type UrlStatus = "live" | "dead" | "unknown";

async function checkUrlStatus(url: string): Promise<UrlStatus> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    // Confirmed dead
    if (res.status === 404 || res.status === 410) return "dead";
    // Confirmed live (including 403/401 — site is up, just auth-gated)
    return "live";
  } catch {
    // HEAD failed — try GET for Vertex AI redirects and other sites that reject HEAD
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });
      if (res.status === 404 || res.status === 410) return "dead";
      return "live";
    } catch {
      // Timeout, SSL error, DNS failure, connection refused — can't determine
      // Don't strip these — the URL may be perfectly valid
      return "unknown";
    }
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
  for (const s of corrected.solutionMappings || []) {
    collectUrls(s.sources);
    if (s.estimatedImpact && typeof s.estimatedImpact === "object") collectUrls(s.estimatedImpact.sources);
  }
  if (corrected.gtm?.sources) collectUrls(corrected.gtm.sources);
  collectUrls(corrected.gtm?.briefSources);
  collectUrls(corrected.gtm?.entrySolutionSources);
  collectUrls(corrected.gtm?.urgencySources);
  collectUrls(corrected.gtm?.competitiveSources);
  for (const dim of Object.values(corrected.scores)) {
    const d = dim as { sources?: Source[] };
    if (d?.sources) collectUrls(d.sources);
  }

  // Pre-filter: strip any Vertex AI redirect/grounding URLs that weren't resolved
  // These are Google-internal URLs useless to end users
  const isVertexUrl = (url: string) =>
    url.includes("vertexaisearch.cloud.google.com/grounding-api-redirect") ||
    url.includes("vertexaisearch.google.com/grounding");

  const stripVertex = (sources: Source[] | undefined): Source[] =>
    (sources || []).filter((s) => !isVertexUrl(s.url));

  let vertexStripped = 0;
  const countAndStrip = (sources: Source[] | undefined): Source[] => {
    const filtered = stripVertex(sources);
    vertexStripped += (sources || []).length - filtered.length;
    return filtered;
  };

  corrected.sources = countAndStrip(corrected.sources);
  for (const t of corrected.triggerEvents || []) t.sources = countAndStrip(t.sources);
  for (const p of corrected.painPoints || []) p.sources = countAndStrip(p.sources);
  for (const s of corrected.solutionMappings || []) {
    s.sources = countAndStrip(s.sources);
    if (s.estimatedImpact && typeof s.estimatedImpact === "object") {
      s.estimatedImpact.sources = countAndStrip(s.estimatedImpact.sources);
    }
  }
  if (corrected.gtm?.sources) corrected.gtm.sources = countAndStrip(corrected.gtm.sources);
  if (corrected.gtm?.briefSources) corrected.gtm.briefSources = countAndStrip(corrected.gtm.briefSources);
  if (corrected.gtm?.entrySolutionSources) corrected.gtm.entrySolutionSources = countAndStrip(corrected.gtm.entrySolutionSources);
  if (corrected.gtm?.urgencySources) corrected.gtm.urgencySources = countAndStrip(corrected.gtm.urgencySources);
  if (corrected.gtm?.competitiveSources) corrected.gtm.competitiveSources = countAndStrip(corrected.gtm.competitiveSources);
  for (const dim of Object.values(corrected.scores)) {
    const d = dim as { sources?: Source[] };
    if (d?.sources) d.sources = countAndStrip(d.sources);
  }
  // Also strip from stakeholder sourceUrl
  for (const s of corrected.stakeholders || []) {
    if (s.sourceUrl && isVertexUrl(s.sourceUrl)) {
      s.sourceUrl = "";
      vertexStripped++;
    }
  }
  if (vertexStripped > 0) {
    warnings.push(`${vertexStripped} unresolved Vertex AI redirect URL(s) stripped`);
  }

  // Rebuild URL set after Vertex stripping
  allUrlSet.clear();
  collectUrls(corrected.sources);
  for (const t of corrected.triggerEvents || []) collectUrls(t.sources);
  for (const p of corrected.painPoints || []) collectUrls(p.sources);
  for (const s of corrected.solutionMappings || []) {
    collectUrls(s.sources);
    if (s.estimatedImpact && typeof s.estimatedImpact === "object") collectUrls(s.estimatedImpact.sources);
  }
  if (corrected.gtm?.sources) collectUrls(corrected.gtm.sources);
  collectUrls(corrected.gtm?.briefSources);
  collectUrls(corrected.gtm?.entrySolutionSources);
  collectUrls(corrected.gtm?.urgencySources);
  collectUrls(corrected.gtm?.competitiveSources);
  for (const dim of Object.values(corrected.scores)) {
    const d = dim as { sources?: Source[] };
    if (d?.sources) collectUrls(d.sources);
  }

  const allUniqueUrls = Array.from(allUrlSet);
  if (allUniqueUrls.length > 0) {
    // Check in batches of 15 to avoid overwhelming the network
    const deadUrls = new Set<string>();
    const unknownUrls = new Set<string>();
    const BATCH_SIZE = 15;
    for (let i = 0; i < allUniqueUrls.length; i += BATCH_SIZE) {
      const batch = allUniqueUrls.slice(i, i + BATCH_SIZE);
      const checks = await Promise.allSettled(
        batch.map(async (url) => ({ url, status: await checkUrlStatus(url) }))
      );
      for (const check of checks) {
        if (check.status === "fulfilled") {
          if (check.value.status === "dead") deadUrls.add(check.value.url);
          else if (check.value.status === "unknown") unknownUrls.add(check.value.url);
        }
      }
    }

    if (unknownUrls.size > 0) {
      warnings.push(`${unknownUrls.size} source URL(s) could not be verified (timeout/SSL) — kept as-is`);
    }

    if (deadUrls.size > 0) {
      // Strip ONLY confirmed dead sources (404/410) from ALL sections
      const stripDead = (sources: Source[] | undefined): Source[] =>
        (sources || []).filter((s) => !deadUrls.has(s.url));

      corrected.sources = stripDead(corrected.sources);
      for (const t of corrected.triggerEvents || []) t.sources = stripDead(t.sources);
      for (const p of corrected.painPoints || []) p.sources = stripDead(p.sources);
      for (const s of corrected.solutionMappings || []) {
        s.sources = stripDead(s.sources);
        if (s.estimatedImpact && typeof s.estimatedImpact === "object") {
          s.estimatedImpact.sources = stripDead(s.estimatedImpact.sources);
        }
      }
      if (corrected.gtm?.sources) corrected.gtm.sources = stripDead(corrected.gtm.sources);
      if (corrected.gtm?.briefSources) corrected.gtm.briefSources = stripDead(corrected.gtm.briefSources);
      if (corrected.gtm?.entrySolutionSources) corrected.gtm.entrySolutionSources = stripDead(corrected.gtm.entrySolutionSources);
      if (corrected.gtm?.urgencySources) corrected.gtm.urgencySources = stripDead(corrected.gtm.urgencySources);
      if (corrected.gtm?.competitiveSources) corrected.gtm.competitiveSources = stripDead(corrected.gtm.competitiveSources);
      for (const dim of Object.values(corrected.scores)) {
        const d = dim as { sources?: Source[] };
        if (d?.sources) d.sources = stripDead(d.sources);
      }

      fixes.push({
        field: "sources",
        current: `${allUniqueUrls.length} unique URLs checked`,
        corrected: `${allUniqueUrls.length - deadUrls.size} kept, ${deadUrls.size} confirmed dead stripped, ${unknownUrls.size} unverifiable kept`,
        reason: "Stripped confirmed dead (404/410) source URLs",
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
        status: s.sourceUrl ? await checkUrlStatus(s.sourceUrl) : "unknown" as UrlStatus,
      }))
    );

    let verifiedCount = 0;
    let strippedCount = 0;
    for (let i = 0; i < corrected.stakeholders.length; i++) {
      const check = stakeholderChecks[i];
      const status = check.status === "fulfilled" ? check.value.status : "unknown";
      if (status === "live") {
        corrected.stakeholders[i].confidence = "verified";
        verifiedCount++;
      } else {
        // Can't confirm URL works — clear it so users never see a broken link
        // The stakeholder data (name, title, tier) is still valuable without the URL
        corrected.stakeholders[i].confidence = "likely";
        corrected.stakeholders[i].sourceUrl = "";
        strippedCount++;
      }
    }

    if (strippedCount > 0) {
      warnings.push(`${strippedCount} unverifiable stakeholder URL(s) cleared`);
    }

    fixes.push({
      field: "stakeholders",
      current: `${corrected.stakeholders.length} stakeholders`,
      corrected: `${verifiedCount} verified, ${strippedCount} URLs cleared`,
      reason: "Checked stakeholder source URL liveness — cleared unverifiable URLs",
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
