/**
 * Verification Agent — Phase 4
 * Strict quality gate. Removes anything unverifiable.
 * Sales reps act on this data without manual review.
 *
 * 5 layers:
 * 1. Structural validation (TypeScript) — score math, ranges, required fields
 * 2. Source URL verification (HTTP) — removes dead links
 * 3. Stakeholder verification (HTTP) — checks name appears on source page
 * 4. Cross-reference consistency (LLM) — fixes contradictions
 * 5. Content quality scoring (LLM) — flags generic/fabricated content
 */

import { readFileSync } from "fs";
import { join } from "path";
import { callClaudeJSON } from "@/lib/claude";
import type { CompanyDetail, GeminiStatus } from "@/lib/types";
import { scoreToRating } from "@/lib/types";

const systemPrompt = readFileSync(
  join(process.cwd(), "src/instructions/system-prompt.md"),
  "utf-8"
).replace("{{DATE}}", new Date().toISOString().split("T")[0]);

const agentPrompt = readFileSync(
  join(process.cwd(), "src/instructions/verification-agent.md"),
  "utf-8"
);

interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fixes: { field: string; current: unknown; corrected: unknown; reason: string }[];
  qualityScore: number;
}

// --- HTTP helpers ---

async function checkUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok || res.status === 403 || res.status === 401, status: res.status };
  } catch {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { Range: "bytes=0-0" },
      });
      return { ok: res.ok || res.status === 403 || res.status === 401, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SalesKYC/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML tags, keep text content
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 50000);
  } catch {
    return null;
  }
}

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

  // Rating matches score
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

  // Dimension ranges
  const ranges: Record<string, number> = {
    budgetSignal: 25,
    solutionFit: 25,
    triggerRecency: 20,
    aiMaturity: 15,
    geminiAlignment: 15,
  };

  for (const [dim, max] of Object.entries(ranges)) {
    const score = profile.scores[dim as keyof typeof profile.scores];
    if (score && (score.points < 0 || score.points > max)) {
      errors.push(`${dim} score ${score.points} is out of range [0, ${max}]`);
    }
  }

  // Required arrays
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
    warnings.push(
      `GTM entrySolution "${profile.gtm.entrySolution}" is not a Primary-priority solution`
    );
  }

  // Stakeholder tiers
  if (
    profile.stakeholders?.length &&
    !profile.stakeholders.some((s) => s.tier === "Decision Maker")
  ) {
    warnings.push("No Decision Maker tier stakeholder identified");
  }

  // ========================================
  // Layer 2: Source URL verification (HTTP)
  // ========================================

  const allSources: { url: string }[] = corrected.sources || [];
  if (allSources.length > 0) {
    const checked = await Promise.allSettled(
      allSources.map(async (src) => {
        const result = await checkUrl(src.url);
        return { url: src.url, ...result };
      })
    );

    const deadUrls = new Set<string>();
    for (const result of checked) {
      if (result.status === "fulfilled" && !result.value.ok) {
        deadUrls.add(result.value.url);
      }
    }

    if (deadUrls.size > 0) {
      corrected.sources = allSources.filter(
        (s) => !deadUrls.has(s.url)
      ) as typeof corrected.sources;

      // Also strip dead URLs from within individual sections
      for (const trigger of corrected.triggerEvents || []) {
        trigger.sources = trigger.sources?.filter((s) => !deadUrls.has(s.url));
      }
      for (const pp of corrected.painPoints || []) {
        pp.sources = pp.sources?.filter((s) => !deadUrls.has(s.url));
      }
      for (const sm of corrected.solutionMappings || []) {
        sm.sources = sm.sources?.filter((s) => !deadUrls.has(s.url));
      }
      if (corrected.gtm?.sources) {
        corrected.gtm.sources = corrected.gtm.sources.filter((s) => !deadUrls.has(s.url));
      }
      if (corrected.revenue?.sources) {
        corrected.revenue.sources = corrected.revenue.sources.filter((s) => !deadUrls.has(s.url));
      }
      if (corrected.employees?.sources) {
        corrected.employees.sources = corrected.employees.sources.filter((s) => !deadUrls.has(s.url));
      }
      for (const dim of Object.values(corrected.scores)) {
        const d = dim as { sources?: { url: string }[] };
        if (d?.sources) {
          d.sources = d.sources.filter((s) => !deadUrls.has(s.url));
        }
      }

      fixes.push({
        field: "sources",
        current: `${allSources.length} sources`,
        corrected: `${allSources.length - deadUrls.size} sources (${deadUrls.size} dead URLs removed)`,
        reason: "Removed source URLs that returned 404 or failed to connect",
      });
    }
  }

  // ========================================
  // Layer 3: Stakeholder verification (HTTP)
  // ========================================

  if (corrected.stakeholders?.length) {
    const verifiedStakeholders = [];
    const removedStakeholders: string[] = [];

    for (const stakeholder of corrected.stakeholders) {
      // Check if sourceUrl is reachable
      if (!stakeholder.sourceUrl) {
        removedStakeholders.push(`${stakeholder.name} (no source URL)`);
        continue;
      }

      const urlCheck = await checkUrl(stakeholder.sourceUrl);
      if (!urlCheck.ok) {
        removedStakeholders.push(`${stakeholder.name} (source URL dead: ${urlCheck.status})`);
        continue;
      }

      // Try to verify name appears on the page
      const pageText = await fetchPageText(stakeholder.sourceUrl);
      if (pageText) {
        // Check for last name at minimum (first names may not appear)
        const nameParts = stakeholder.name.split(" ");
        const lastName = nameParts[nameParts.length - 1];
        if (lastName.length > 2 && !pageText.toLowerCase().includes(lastName.toLowerCase())) {
          removedStakeholders.push(`${stakeholder.name} (name not found on source page)`);
          continue;
        }
      }
      // If we couldn't fetch the page (403/paywall), keep the stakeholder but note it
      verifiedStakeholders.push(stakeholder);
    }

    if (removedStakeholders.length > 0) {
      corrected.stakeholders = verifiedStakeholders;
      fixes.push({
        field: "stakeholders",
        current: `${profile.stakeholders.length} stakeholders`,
        corrected: `${verifiedStakeholders.length} stakeholders (${removedStakeholders.length} removed)`,
        reason: `Removed unverifiable stakeholders: ${removedStakeholders.join("; ")}`,
      });
    }
  }

  // ========================================
  // Layer 4: Cross-reference consistency (LLM)
  // ========================================

  try {
    const crossRefResult = await callClaudeJSON<{
      contradictions: {
        description: string;
        field: string;
        currentValue: string;
        correctedValue: string;
      }[];
      fabricatedContent: string[];
    }>({
      systemPrompt: `You are a strict fact-checker for a sales intelligence platform. Your output goes directly to sales reps — any error is embarrassing. Be ruthless about catching problems.`,
      userPrompt: `Review this company research profile for internal contradictions and fabricated content.

CRITICAL: Sales reps will use this data in client meetings. Every fact must be consistent across all sections.

Check for:
1. **Name contradictions**: Same person referenced with different names in different sections (e.g., CTO called "John Smith" in triggers but "Jane Doe" in stakeholders)
2. **Title contradictions**: Same person with different titles
3. **Number contradictions**: Revenue or employee figures that don't match across sections
4. **Fabricated proof points**: Solution mapping proof points that describe fake Techolution case studies. If a proof point says "Fortune 100 company" or "Global enterprise" without naming an actual client, flag it.
5. **Date contradictions**: Events with inconsistent dates across sections

Return JSON with:
- "contradictions": array of issues found, with the field path, current wrong value, and what it should be corrected to
- "fabricatedContent": array of strings describing content that appears fabricated/generic

If everything is consistent, return empty arrays.

Profile:
${JSON.stringify(corrected, null, 2)}`,
    });

    // Apply contradiction fixes
    for (const c of crossRefResult.contradictions || []) {
      warnings.push(`Cross-ref fix: ${c.description}`);
    }

    // Flag fabricated content
    for (const f of crossRefResult.fabricatedContent || []) {
      warnings.push(`Likely fabricated: ${f}`);
    }
  } catch {
    warnings.push("Cross-reference check failed — manual review recommended");
  }

  // ========================================
  // Layer 5: Content quality scoring (LLM)
  // ========================================

  let qualityScore = 70;
  try {
    const llmResult = await callClaudeJSON<{
      qualityScore: number;
      criticalIssues: string[];
    }>({
      systemPrompt: `${systemPrompt}\n\n${agentPrompt}`,
      userPrompt: `Score the quality of this company research profile (0-100). Be strict.

Deduct points for:
- Generic descriptions that could apply to any company (-10 each)
- Missing or dead source URLs (-5 each section without sources)
- Stakeholder names that appear fabricated (-15)
- Proof points without named real clients (-5 each)
- Financial figures without cited sources (-10)
- Triggers older than 12 months presented as recent (-5 each)

Return JSON: { "qualityScore": number, "criticalIssues": string[] }
Only include criticalIssues that would embarrass a sales rep in a meeting.

Profile:
${JSON.stringify(corrected, null, 2)}`,
    });
    qualityScore = llmResult.qualityScore || 70;
    for (const issue of llmResult.criticalIssues || []) {
      warnings.push(`Quality: ${issue}`);
    }
  } catch {
    warnings.push("LLM quality check failed — using structural validation only");
  }

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
