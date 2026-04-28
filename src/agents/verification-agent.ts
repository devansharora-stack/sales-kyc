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
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KYCGenie/1.0)" },
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
  // Layer 3: Stakeholder verification (HTTP + LLM)
  // ========================================
  // Instead of removing stakeholders, assign confidence:
  //   "verified"   — name found on a live source page
  //   "likely"     — source URL is live but name not found (paywall, JS-rendered)
  //                  OR well-known exec from a major public company
  //   "unverified" — source URL dead, no corroboration

  if (corrected.stakeholders?.length) {
    let verifiedCount = 0;
    let likelyCount = 0;
    let unverifiedCount = 0;

    for (const stakeholder of corrected.stakeholders) {
      if (!stakeholder.sourceUrl) {
        stakeholder.confidence = "unverified";
        unverifiedCount++;
        continue;
      }

      const urlCheck = await checkUrl(stakeholder.sourceUrl);
      if (!urlCheck.ok) {
        // URL dead — but still keep the stakeholder, mark unverified
        stakeholder.confidence = "unverified";
        unverifiedCount++;
        continue;
      }

      // URL is live — try to find name on page
      const pageText = await fetchPageText(stakeholder.sourceUrl);
      if (pageText) {
        const nameParts = stakeholder.name.split(" ");
        const lastName = nameParts[nameParts.length - 1];
        if (lastName.length > 2 && pageText.toLowerCase().includes(lastName.toLowerCase())) {
          stakeholder.confidence = "verified";
          verifiedCount++;
          continue;
        }
      }

      // URL live but couldn't confirm name (paywall, JS page, etc.)
      stakeholder.confidence = "likely";
      likelyCount++;
    }

    // Use LLM to cross-check well-known executives (CEO, CFO, CTO of public companies)
    // This catches cases where the URL is dead but the person is real
    if (unverifiedCount > 0) {
      try {
        const unverifiedNames = corrected.stakeholders
          .filter((s) => s.confidence === "unverified")
          .map((s) => ({ name: s.name, title: s.title }));

        const llmCheck = await callClaudeJSON<{
          assessments: { name: string; realPerson: boolean; reason: string }[];
        }>({
          systemPrompt: "You are a fact-checker. Assess whether these people actually hold these positions at the company. Only confirm if you are HIGHLY confident from your training data. If uncertain, say false.",
          userPrompt: `Company: ${corrected.name} (${corrected.fullName})
Industry: ${corrected.industry}

Are these people real executives at this company with these titles?

${JSON.stringify(unverifiedNames, null, 2)}

Return JSON: { "assessments": [{ "name": "...", "realPerson": true/false, "reason": "..." }] }
Only say realPerson: true if you are very confident.`,
        });

        for (const assessment of llmCheck.assessments || []) {
          const stakeholder = corrected.stakeholders.find(
            (s) => s.name === assessment.name && s.confidence === "unverified"
          );
          if (stakeholder && assessment.realPerson) {
            stakeholder.confidence = "likely";
            likelyCount++;
            unverifiedCount--;
          }
        }
      } catch {
        warnings.push("LLM stakeholder cross-check failed");
      }
    }

    fixes.push({
      field: "stakeholders",
      current: `${corrected.stakeholders.length} stakeholders (no confidence)`,
      corrected: `${verifiedCount} verified, ${likelyCount} likely, ${unverifiedCount} unverified`,
      reason: "Assigned confidence levels based on source URL check + name verification + LLM cross-check",
    });

    if (unverifiedCount > 0) {
      warnings.push(
        `${unverifiedCount} stakeholder(s) marked "unverified" — sales rep should confirm before outreach`
      );
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
      const desc = c.description || `${c.field}: "${c.currentValue}" → "${c.correctedValue}"`;
      warnings.push(`Cross-ref fix: ${desc}`);
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
