"use client";

import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
} from "recharts";

export interface DashboardData {
  totals: {
    activeProjects: number;
    archivedProjects: number;
    companies: number;
    stakeholdersAnalyzed: number;
    avgScore: number | null;
  };
  ratingDist: { rating: string; count: number }[];
  geminiSplit: { status: string; count: number }[];
  industries: { industry: string; count: number }[];
  scoreHistogram: { bucket: string; count: number }[];
  leaderboard: {
    name: string;
    slug: string;
    projectId: string | null;
    totalScore: number | null;
    rating: string | null;
    industry: string | null;
  }[];
  weeklyTrend: { week: string; companies: number; stakeholders: number }[];
  activityHeatmap: { date: string; count: number }[];
  heatmapStats: {
    total: number;
    busiestDay: { date: string; count: number };
    currentStreak: number;
    weeklyAvg: number;
    activeDays: number;
  };
  momentumPct: number;
  insight: string;
  recentActivity: {
    type: "company" | "stakeholder";
    label: string;
    sublabel: string;
    projectId: string | null;
    slug: string | null;
    at: string | null;
  }[];
}

const BRAND = "#3289FF";
const BRAND_SOFT = "#93c5fd";
const GRID = "rgba(148,163,184,0.15)";

// Rating → hex (mirrors RATING_COLORS tailwind names in types.ts).
const RATING_HEX: Record<string, string> = {
  A: "#10b981", // emerald
  B: "#3289FF", // blue/brand
  C: "#f59e0b", // amber
  D: "#f97316", // orange
  E: "#ef4444", // red
  F: "#94a3b8", // slate
};

const GEMINI_HEX: Record<string, string> = {
  land: "#10b981",
  expand: "#3289FF",
  explore: "#f59e0b",
  none: "#cbd5e1",
};

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid var(--surface-border)",
  background: "var(--surface-bg)",
  boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
} as const;

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 h-full flex flex-col">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <p className="text-xs text-slate-300 dark:text-slate-600">{label}</p>
    </div>
  );
}

export function RatingDonut({ data }: { data: DashboardData["ratingDist"] }) {
  const nonZero = data.filter((d) => d.count > 0);
  const total = nonZero.reduce((s, d) => s + d.count, 0);
  return (
    <ChartCard title="Fit Rating" subtitle="Companies by A–F rating">
      {total === 0 ? (
        <EmptyState label="No scored companies yet" />
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="55%" height={200}>
            <PieChart>
              <Pie data={nonZero} dataKey="count" nameKey="rating" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="none">
                {nonZero.map((d) => (
                  <Cell key={d.rating} fill={RATING_HEX[d.rating] || BRAND} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, _n, p) => [`${v} companies`, `Rating ${(p as { payload: { rating: string } }).payload.rating}`]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {data.map((d) => (
              <div key={d.rating} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: RATING_HEX[d.rating] }} />
                <span className="text-slate-600 dark:text-slate-300 font-medium">{d.rating}</span>
                <span className="text-slate-400 dark:text-slate-500 ml-auto tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export function ResearchTrend({ data }: { data: DashboardData["weeklyTrend"] }) {
  const total = data.reduce((s, d) => s + d.companies + d.stakeholders, 0);
  return (
    <ChartCard title="Research Momentum" subtitle="Companies & stakeholders per week">
      {total === 0 ? (
        <EmptyState label="No research activity yet" />
      ) : (
        <>
          <div className="flex items-center gap-4 mb-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BRAND }} /> Companies
            </span>
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: BRAND_SOFT }} /> Stakeholders
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCompanies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradStake" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_SOFT} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={BRAND_SOFT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: GRID }} />
              <Area type="monotone" dataKey="companies" stroke={BRAND} strokeWidth={2} fill="url(#gradCompanies)" />
              <Area type="monotone" dataKey="stakeholders" stroke={BRAND_SOFT} strokeWidth={2} fill="url(#gradStake)" />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartCard>
  );
}

export function ScoreHistogram({ data }: { data: DashboardData["scoreHistogram"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <ChartCard title="Score Distribution" subtitle="Fit score 0–100">
      {total === 0 ? (
        <EmptyState label="No scored companies yet" />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: "rgba(50,137,255,0.06)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${v} companies`, "Count"]}
            />
            <Bar dataKey="count" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#64748b" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function shortIndustry(name: string): string {
  const map: Record<string, string> = {
    "Financial Services": "Finance",
    "Financial Technology": "Fintech",
    "Sporting Goods": "Sporting",
    Technology: "Tech",
    Healthcare: "Health",
    Insurance: "Insurance",
    Utilities: "Utilities",
    Retail: "Retail",
    Other: "Other",
  };
  return map[name] || (name.length > 10 ? name.slice(0, 9) + "…" : name);
}

export function IndustryBars({ data }: { data: DashboardData["industries"] }) {
  const chartData = data.map((d) => ({ ...d, short: shortIndustry(d.industry) }));
  return (
    <ChartCard title="Industries" subtitle="Top verticals researched">
      {data.length === 0 ? (
        <EmptyState label="No companies yet" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 16, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
            <XAxis
              dataKey="short"
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={56}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: "rgba(50,137,255,0.06)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v) => [`${v} companies`, "Count"]}
              labelFormatter={(_l, p) => (p && p[0] ? (p[0].payload as { industry: string }).industry : "")}
            />
            <Bar dataKey="count" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={32}>
              <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#64748b" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function GeminiSplit({ data }: { data: DashboardData["geminiSplit"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <ChartCard title="Gemini Posture" subtitle="Land · Expand · Explore">
      {total === 0 ? (
        <EmptyState label="No companies yet" />
      ) : (
        <div className="space-y-4 pt-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {data
              .filter((d) => d.count > 0)
              .map((d) => (
                <div
                  key={d.status}
                  style={{ width: `${(d.count / total) * 100}%`, background: GEMINI_HEX[d.status] }}
                  title={`${d.status}: ${d.count}`}
                />
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.map((d) => (
              <div key={d.status} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GEMINI_HEX[d.status] }} />
                <span className="text-slate-600 dark:text-slate-300 capitalize">{d.status}</span>
                <span className="text-slate-400 dark:text-slate-500 ml-auto tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ActivityIcon({ type }: { type: "company" | "stakeholder" }) {
  if (type === "stakeholder") {
    return (
      <span className="w-7 h-7 rounded-full bg-[rgba(50,137,255,0.1)] flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-[#3289FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </span>
    );
  }
  return (
    <span className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m6-14h6M9 11h6m-6 4h3" />
      </svg>
    </span>
  );
}

export function ActivityFeed({ data }: { data: DashboardData["recentActivity"] }) {
  return (
    <ChartCard title="Recent Activity" subtitle="Latest research across your workspace">
      {data.length === 0 ? (
        <EmptyState label="No recent activity" />
      ) : (
        <div className="-my-1 divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((a, i) => {
            const href =
              a.type === "company" && a.projectId && a.slug
                ? `/projects/${a.projectId}/company/${a.slug}`
                : a.projectId
                ? `/projects/${a.projectId}`
                : null;
            const row = (
              <div className="flex items-center gap-3 py-2.5">
                <ActivityIcon type={a.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{a.label}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{a.sublabel}</p>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{relativeTime(a.at)}</span>
              </div>
            );
            return href ? (
              <Link key={i} href={href} className="block -mx-2 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                {row}
              </Link>
            ) : (
              <div key={i}>{row}</div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

const HEAT_LEVELS = [
  "bg-slate-100 dark:bg-slate-800",
  "bg-[rgba(50,137,255,0.25)]",
  "bg-[rgba(50,137,255,0.45)]",
  "bg-[rgba(50,137,255,0.7)]",
  "bg-[#3289FF]",
];

function heatLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function StatBlock({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums tracking-tight">{value}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

export function ActivityHeatmap({
  data,
  stats,
}: {
  data: DashboardData["activityHeatmap"];
  stats: DashboardData["heatmapStats"];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);
  const busiestLabel = stats.busiestDay.date
    ? new Date(stats.busiestDay.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  // Build week columns (Sun–Sat). Pad the first week so weekday rows align.
  const weeks: ({ date: string; count: number } | null)[][] = [];
  let current: ({ date: string; count: number } | null)[] = [];
  data.forEach((d, i) => {
    const dow = new Date(d.date + "T00:00:00").getDay();
    if (i === 0 && dow > 0) for (let k = 0; k < dow; k++) current.push(null);
    current.push(d);
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  });
  if (current.length) {
    while (current.length < 7) current.push(null);
    weeks.push(current);
  }

  // Month labels: first week whose first real day starts a new month.
  const monthLabels = weeks.map((w, wi) => {
    const firstReal = w.find((c) => c);
    if (!firstReal) return "";
    const m = new Date(firstReal.date + "T00:00:00").getMonth();
    const prev = wi > 0 ? weeks[wi - 1].find((c) => c) : null;
    const prevM = prev ? new Date(prev.date + "T00:00:00").getMonth() : -1;
    return m !== prevM ? MONTH_ABBR[m] : "";
  });

  return (
    <ChartCard title="Research Activity" subtitle={`${total} research events · last 26 weeks`}>
      {total === 0 ? (
        <EmptyState label="No research activity yet" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <div className="inline-flex flex-col gap-1 min-w-full">
              <div className="flex gap-[3px] pl-0">
                {monthLabels.map((m, i) => (
                  <div key={i} className="w-[13px] text-[9px] text-slate-400 dark:text-slate-500 text-left">
                    {m}
                  </div>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((w, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {w.map((cell, di) => (
                      <div
                        key={di}
                        className={`w-[13px] h-[13px] rounded-[3px] ${cell ? HEAT_LEVELS[heatLevel(cell.count, max)] : "bg-transparent"}`}
                        title={cell ? `${cell.count} on ${cell.date}` : ""}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                <span>Less</span>
                {HEAT_LEVELS.map((c, i) => (
                  <span key={i} className={`w-[11px] h-[11px] rounded-[3px] ${c}`} />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-x-4 gap-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <StatBlock value={stats.currentStreak + (stats.currentStreak === 1 ? " day" : " days")} label="Current streak" />
            <StatBlock value={stats.weeklyAvg} label="Weekly avg" />
            <StatBlock value={busiestLabel} label={`Busiest · ${stats.busiestDay.count}`} />
            <StatBlock value={stats.activeDays} label="Active days" />
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export function InsightBanner({ insight, momentumPct }: { insight: string; momentumPct: number }) {
  if (!insight) return null;
  const up = momentumPct > 0;
  const flat = momentumPct === 0;
  return (
    <div className="card p-4 flex items-center gap-3 border-l-2 border-l-[#3289FF]">
      <span className="w-7 h-7 rounded-full bg-[rgba(50,137,255,0.1)] flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-[#3289FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </span>
      <p className="text-sm text-slate-600 dark:text-slate-300 flex-1 min-w-0">
        <span className="text-label text-slate-400 dark:text-slate-500 mr-2">Insight</span>
        {insight}
      </p>
      {!flat && (
        <span
          className={`text-xs font-semibold tabular-nums whitespace-nowrap ${up ? "text-emerald-500" : "text-orange-500"}`}
        >
          {up ? "▲" : "▼"} {Math.abs(momentumPct)}%
        </span>
      )}
    </div>
  );
}

export function Leaderboard({ data }: { data: DashboardData["leaderboard"] }) {
  return (
    <ChartCard title="Top Companies" subtitle="Highest fit scores">
      {data.length === 0 ? (
        <EmptyState label="No companies yet" />
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {data.map((c, i) => (
                <tr key={`${c.projectId}-${c.slug}`} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                  <td className="py-2.5 pr-2 text-[11px] text-slate-300 dark:text-slate-600 w-6 tabular-nums">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    {c.projectId ? (
                      <Link
                        href={`/projects/${c.projectId}/company/${c.slug}`}
                        className="font-medium text-slate-700 dark:text-slate-200 hover:text-[#3289FF]"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                    )}
                    {c.industry && <span className="block text-[10px] text-slate-400 dark:text-slate-500">{c.industry}</span>}
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    {c.rating && (
                      <span
                        className="badge mr-2"
                        style={{ background: `${RATING_HEX[c.rating]}18`, color: RATING_HEX[c.rating] }}
                      >
                        {c.rating}
                      </span>
                    )}
                    <span className="font-bold text-[#3289FF] tabular-nums">{c.totalScore ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
