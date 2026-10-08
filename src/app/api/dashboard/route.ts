import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, companyProfiles, stakeholderProfiles } from "@/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { scoreToRating, type Rating } from "@/lib/types";

/**
 * Per-user analytics aggregate for the Dashboard.
 * Folds every company across all of the user's projects into the distributions
 * the charts render — rating spread, gemini status, industries, score
 * histogram, a top-scored leaderboard — plus a weekly research-volume trend and
 * a recent-activity feed. Kept to a handful of small selects in one round-trip.
 */

const WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 (local) of the week containing `d`. */
function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) {
    return NextResponse.json(emptyPayload());
  }

  const [projectRows, companyRows, stakeholderStat, stakeholderRows] = await Promise.all([
    db.select({ id: projects.id, status: projects.status }).from(projects).where(eq(projects.userId, user.id)),
    db
      .select({
        name: companyProfiles.slug, // fallback label; real name pulled from data below
        slug: companyProfiles.slug,
        projectId: companyProfiles.projectId,
        totalScore: companyProfiles.totalScore,
        rating: companyProfiles.rating,
        industry: companyProfiles.industry,
        geminiStatus: companyProfiles.geminiStatus,
        data: companyProfiles.data,
        createdAt: companyProfiles.createdAt,
      })
      .from(companyProfiles)
      .where(eq(companyProfiles.userId, user.id)),
    db
      .select({ value: count() })
      .from(stakeholderProfiles)
      .where(and(eq(stakeholderProfiles.userId, user.id), eq(stakeholderProfiles.status, "completed"))),
    db
      .select({
        name: stakeholderProfiles.name,
        company: stakeholderProfiles.company,
        projectId: stakeholderProfiles.projectId,
        status: stakeholderProfiles.status,
        createdAt: stakeholderProfiles.createdAt,
      })
      .from(stakeholderProfiles)
      .where(eq(stakeholderProfiles.userId, user.id))
      .orderBy(desc(stakeholderProfiles.createdAt))
      .limit(200),
  ]);

  const activeProjects = projectRows.filter((p) => p.status === "active").length;
  const archivedProjects = projectRows.length - activeProjects;

  // Rating distribution A–F. Fall back to score-derived rating when column is null.
  const ratingOrder: Rating[] = ["A", "B", "C", "D", "E", "F"];
  const ratingCounts: Record<string, number> = {};
  const geminiCounts: Record<string, number> = { land: 0, expand: 0, explore: 0, none: 0 };
  const industryCounts: Record<string, number> = {};
  const buckets = ["0-20", "20-40", "40-60", "60-80", "80-100"];
  const bucketCounts: Record<string, number> = Object.fromEntries(buckets.map((b) => [b, 0]));

  let scoreSum = 0;
  let scored = 0;

  const leaderboard = companyRows
    .map((c) => {
      const d = (c.data || {}) as { name?: string; industry?: string };
      const score = typeof c.totalScore === "number" ? c.totalScore : null;
      const rating = (c.rating as Rating) || (score != null ? scoreToRating(score) : null);
      if (rating) ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;

      const g = (c.geminiStatus || "none").toLowerCase();
      if (g in geminiCounts) geminiCounts[g] += 1;
      else geminiCounts.none += 1;

      const industry = (c.industry || d.industry || "Unknown").trim() || "Unknown";
      industryCounts[industry] = (industryCounts[industry] || 0) + 1;

      if (score != null) {
        scoreSum += score;
        scored += 1;
        const idx = Math.min(4, Math.floor(score / 20));
        bucketCounts[buckets[idx]] += 1;
      }

      return {
        name: d.name || c.name,
        slug: c.slug,
        projectId: c.projectId,
        totalScore: score,
        rating,
        industry,
      };
    })
    .sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1))
    .slice(0, 10);

  // Top 8 industries + roll the rest into "Other".
  const industriesSorted = Object.entries(industryCounts).sort((a, b) => b[1] - a[1]);
  const topIndustries = industriesSorted.slice(0, 8).map(([industry, c]) => ({ industry, count: c }));
  const otherCount = industriesSorted.slice(8).reduce((s, [, c]) => s + c, 0);
  if (otherCount > 0) topIndustries.push({ industry: "Other", count: otherCount });

  // ── Weekly research-volume trend (last 12 weeks) ──────────────────────────
  const now = new Date();
  const firstWeek = weekStart(new Date(now.getTime() - (WEEKS - 1) * 7 * DAY_MS));
  const weekSlots: { start: number; week: string; companies: number; stakeholders: number }[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const start = new Date(firstWeek.getTime() + i * 7 * DAY_MS);
    weekSlots.push({ start: start.getTime(), week: weekLabel(start), companies: 0, stakeholders: 0 });
  }
  const slotFor = (d: Date | null): (typeof weekSlots)[number] | null => {
    if (!d) return null;
    const ws = weekStart(new Date(d)).getTime();
    return weekSlots.find((s) => s.start === ws) || null;
  };
  for (const c of companyRows) {
    const s = slotFor(c.createdAt);
    if (s) s.companies += 1;
  }
  for (const sh of stakeholderRows) {
    if (sh.status !== "completed") continue;
    const s = slotFor(sh.createdAt);
    if (s) s.stakeholders += 1;
  }
  const weeklyTrend = weekSlots.map(({ week, companies, stakeholders }) => ({ week, companies, stakeholders }));

  // ── Daily research heatmap (last 26 weeks, GitHub-style) ──────────────────
  const dayKey = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const heatCounts: Record<string, number> = {};
  for (const c of companyRows) if (c.createdAt) heatCounts[dayKey(new Date(c.createdAt))] = (heatCounts[dayKey(new Date(c.createdAt))] || 0) + 1;
  for (const sh of stakeholderRows) {
    if (sh.status === "completed" && sh.createdAt) heatCounts[dayKey(new Date(sh.createdAt))] = (heatCounts[dayKey(new Date(sh.createdAt))] || 0) + 1;
  }
  const HEAT_DAYS = 182;
  const heatStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HEAT_DAYS - 1));
  const activityHeatmap: { date: string; count: number }[] = [];
  for (let i = 0; i < HEAT_DAYS; i++) {
    const d = new Date(heatStart.getTime() + i * DAY_MS);
    const key = dayKey(d);
    activityHeatmap.push({ date: key, count: heatCounts[key] || 0 });
  }

  // ── Recent activity feed (per-user, top 8) ────────────────────────────────
  const projById = new Map(projectRows.map((p) => [p.id, p]));
  type Feed = { type: "company" | "stakeholder"; label: string; sublabel: string; projectId: string | null; slug: string | null; at: string | null };
  const companyFeed: Feed[] = companyRows.map((c) => {
    const d = (c.data || {}) as { name?: string };
    return {
      type: "company",
      label: d.name || c.name,
      sublabel: "Company researched",
      projectId: c.projectId,
      slug: c.slug,
      at: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    };
  });
  const stakeholderFeed: Feed[] = stakeholderRows
    .filter((sh) => sh.status === "completed")
    .map((sh) => ({
      type: "stakeholder",
      label: sh.company ? `${sh.name} · ${sh.company}` : sh.name,
      sublabel: "Stakeholder analyzed",
      projectId: sh.projectId,
      slug: null,
      at: sh.createdAt ? new Date(sh.createdAt).toISOString() : null,
    }));
  const recentActivity = [...companyFeed, ...stakeholderFeed]
    .filter((f) => f.at && (f.projectId === null || projById.has(f.projectId)))
    .sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime())
    .slice(0, 8);

  // ── Heatmap side-stats ────────────────────────────────────────────────────
  let busiest = { date: "", count: 0 };
  for (const h of activityHeatmap) if (h.count > busiest.count) busiest = h;
  let currentStreak = 0;
  for (let i = activityHeatmap.length - 1; i >= 0; i--) {
    if (activityHeatmap[i].count > 0) currentStreak++;
    else break;
  }
  const heatTotal = activityHeatmap.reduce((s, h) => s + h.count, 0);
  const activeDays = activityHeatmap.filter((h) => h.count > 0).length;
  const heatmapStats = {
    total: heatTotal,
    busiestDay: busiest,
    currentStreak,
    weeklyAvg: Math.round((heatTotal / (HEAT_DAYS / 7)) * 10) / 10,
    activeDays,
  };

  // ── Momentum + rule-based portfolio insight ───────────────────────────────
  const vol = weeklyTrend.map((w) => w.companies + w.stakeholders);
  const last4 = vol.slice(-4).reduce((a, b) => a + b, 0);
  const prev4 = vol.slice(-8, -4).reduce((a, b) => a + b, 0);
  const momentumPct = prev4 > 0 ? Math.round(((last4 - prev4) / prev4) * 100) : last4 > 0 ? 100 : 0;

  const avg = scored > 0 ? Math.round(scoreSum / scored) : null;
  const topInd = topIndustries.filter((i) => i.industry !== "Other" && i.industry !== "Unknown").sort((a, b) => b.count - a.count)[0];
  const highFitPct = companyRows.length ? Math.round((((ratingCounts.A || 0) + (ratingCounts.B || 0)) / companyRows.length) * 100) : 0;
  const insightParts: string[] = [];
  if (topInd) insightParts.push(`${topInd.industry} leads with ${topInd.count} companies`);
  if (avg != null) insightParts.push(`average fit ${avg}/100`);
  insightParts.push(`${highFitPct}% rated A–B`);
  if (momentumPct !== 0) insightParts.push(`research ${momentumPct > 0 ? "up" : "down"} ${Math.abs(momentumPct)}% over the last 4 weeks`);
  const insight = insightParts.join(" · ");

  return NextResponse.json({
    totals: {
      activeProjects,
      archivedProjects,
      companies: companyRows.length,
      stakeholdersAnalyzed: stakeholderStat[0]?.value ?? 0,
      avgScore: scored > 0 ? Math.round(scoreSum / scored) : null,
    },
    ratingDist: ratingOrder.map((r) => ({ rating: r, count: ratingCounts[r] || 0 })),
    geminiSplit: ["land", "expand", "explore", "none"].map((s) => ({ status: s, count: geminiCounts[s] })),
    industries: topIndustries,
    scoreHistogram: buckets.map((b) => ({ bucket: b, count: bucketCounts[b] })),
    leaderboard,
    weeklyTrend,
    recentActivity,
    activityHeatmap,
    heatmapStats,
    momentumPct,
    insight,
  });
}

function emptyPayload() {
  return {
    totals: { activeProjects: 0, archivedProjects: 0, companies: 0, stakeholdersAnalyzed: 0, avgScore: null },
    ratingDist: [],
    geminiSplit: [],
    industries: [],
    scoreHistogram: [],
    leaderboard: [],
    weeklyTrend: [],
    recentActivity: [],
    activityHeatmap: [],
    heatmapStats: { total: 0, busiestDay: { date: "", count: 0 }, currentStreak: 0, weeklyAvg: 0, activeDays: 0 },
    momentumPct: 0,
    insight: "",
  };
}
