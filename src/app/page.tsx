"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  RatingDonut,
  ScoreHistogram,
  IndustryBars,
  Leaderboard,
  ResearchTrend,
  ActivityFeed,
  ActivityHeatmap,
  InsightBanner,
  type DashboardData,
} from "@/components/dashboard/DashboardCharts";

function StatCard({
  value,
  label,
  hint,
  href,
}: {
  value: string | number;
  label: string;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="card p-5 h-full flex flex-col justify-between group">
      <p className="text-label text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2 tracking-tight tabular-nums group-hover:text-[#3289FF] transition-colors">
        {value}
      </p>
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: DashboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const empty = !loading && !error && data && data.totals.companies === 0 && data.totals.activeProjects === 0;

  return (
    <div className="animate-fade-in">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Portfolio analytics across all your research</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/solutions" className="btn-ghost text-sm text-[#3289FF]">
            Solution Repository
          </Link>
          <Link href="/projects/new" className="btn-primary gap-2">
            <span>+</span> New Project
          </Link>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-5">
                <div className="h-3 w-20 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse mb-3" />
                <div className="h-8 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-6 h-[260px] animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-400 dark:text-red-300 text-xl">!</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Failed to load dashboard.</p>
          <button onClick={() => window.location.reload()} className="btn-ghost text-sm">
            Try Again
          </button>
        </div>
      )}

      {/* Empty */}
      {empty && (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-[rgba(50,137,255,0.08)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#3289FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No research yet</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">Create a project and add companies to start AI-powered research</p>
          <Link href="/projects/new" className="btn-primary">
            Create First Project
          </Link>
        </div>
      )}

      {/* Analytics */}
      {!loading && !error && data && !empty && (
        <div className="space-y-6">
          {/* KPI hero row */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard value={data.totals.activeProjects} label="Active Projects" hint={`${data.totals.archivedProjects} archived`} href="/projects" />
            <StatCard value={data.totals.companies} label="Companies Researched" href="/projects" />
            <StatCard value={data.totals.stakeholdersAnalyzed} label="Stakeholders Analyzed" href="/stakeholders" />
            <StatCard value={data.totals.avgScore ?? "—"} label="Avg Fit Score" hint={data.totals.avgScore != null ? "out of 100" : undefined} />
          </div>

          {/* AI insight line */}
          <InsightBanner insight={data.insight} momentumPct={data.momentumPct} />

          {/* Rating + Score + Research activity (3-up) */}
          <div className="grid grid-cols-3 gap-4">
            <RatingDonut data={data.ratingDist} />
            <ScoreHistogram data={data.scoreHistogram} />
            <ActivityHeatmap data={data.activityHeatmap} stats={data.heatmapStats} />
          </div>

          {/* Research momentum + industries */}
          <div className="grid grid-cols-2 gap-4">
            <ResearchTrend data={data.weeklyTrend} />
            <IndustryBars data={data.industries} />
          </div>

          {/* Top scores + recent companies — equal height, end same baseline */}
          <div className="grid grid-cols-2 gap-4">
            <Leaderboard data={data.leaderboard} />
            <ActivityFeed data={data.recentActivity} />
          </div>

          <div className="text-center">
            <Link href="/projects" className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF]">
              Go to Projects →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
