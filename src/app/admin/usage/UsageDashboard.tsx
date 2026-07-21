"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

type Group = "company" | "stakeholder" | "user" | "project";
type SortKey = "cost" | "tokens" | "name" | "recency";

interface Row { label: string; tokens: number; inputTokens: number; outputTokens: number; costUsd: number; lastActivity?: string | null; }
interface ModelRow { model: string; tokens: number; inputTokens: number; outputTokens: number; costUsd: number; }
interface SeriesPoint { day: string; tokens: number; costUsd: number; }
interface Options { users: { id: string; email: string }[]; companies: { slug: string; name: string }[]; }
interface UsageResponse {
  groupBy: Group;
  totals: { inputTokens: number; outputTokens: number; tokens: number; costUsd: number };
  breakdown: Row[];
  models: ModelRow[];
  series: SeriesPoint[];
  options?: Options;
  allTime?: boolean;
  from?: string | null;
  to?: string | null;
}
interface FeedItem { type: "research_run" | "deep_analysis" | "opened"; subtype?: string; userEmail: string; label: string; at: string | null; }

const GROUPS: { id: Group; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "stakeholder", label: "Stakeholder" },
  { id: "user", label: "User" },
  { id: "project", label: "Project" },
];

type Preset = "all" | "today" | "7d" | "30d" | "mtd" | "lastMonth" | "ytd" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "mtd", label: "Month to date" },
  { id: "lastMonth", label: "Last month" },
  { id: "ytd", label: "Year to date" },
  { id: "custom", label: "Custom" },
];

const fmtTokens = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

function rangeForPreset(p: Preset, from: string, to: string): { from: string; to: string; allTime: boolean } {
  const now = new Date();
  const today = isoDay(now);
  switch (p) {
    case "all": return { from, to, allTime: true };
    case "today": return { from: today, to: today, allTime: false };
    case "7d": return { from: isoDay(new Date(Date.now() - 6 * 86400000)), to: today, allTime: false };
    case "30d": return { from: isoDay(new Date(Date.now() - 29 * 86400000)), to: today, allTime: false };
    case "mtd": return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: today, allTime: false };
    case "lastMonth": return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)), allTime: false };
    case "ytd": return { from: isoDay(new Date(now.getFullYear(), 0, 1)), to: today, allTime: false };
    default: return { from, to, allTime: false };
  }
}

const FEED_LABEL: Record<FeedItem["type"], string> = {
  research_run: "researched",
  deep_analysis: "analyzed",
  opened: "opened",
};

export default function UsageDashboard({ preview }: { preview?: (g: Group) => UsageResponse }) {
  const [groupBy, setGroupBy] = useState<Group>("company");
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [allTime, setAllTime] = useState(false);
  const [selUsers, setSelUsers] = useState<string[]>([]);
  const [selCompanies, setSelCompanies] = useState<string[]>([]);
  const [options, setOptions] = useState<Options>({ users: [], companies: [] });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [data, setData] = useState<UsageResponse | null>(() => (preview ? preview("company") : null));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useCallback(() => {
    const p = new URLSearchParams({ groupBy });
    if (allTime) p.set("allTime", "1");
    else { p.set("from", from); p.set("to", to); }
    if (selUsers.length) p.set("users", selUsers.join(","));
    if (selCompanies.length) p.set("companies", selCompanies.join(","));
    return p;
  }, [groupBy, allTime, from, to, selUsers, selCompanies]);

  const load = useCallback(async () => {
    if (preview) { setData(preview(groupBy)); return; }
    setLoading(true);
    setError(null);
    try {
      const [uRes, aRes] = await Promise.all([
        fetch(`/api/admin/usage?${params()}`),
        fetch(`/api/admin/activity?${params()}`),
      ]);
      if (!uRes.ok) throw new Error(uRes.status === 403 ? "Not authorized" : `Error ${uRes.status}`);
      const u: UsageResponse = await uRes.json();
      setData(u);
      if (u.options) setOptions(u.options);
      setFeed(aRes.ok ? (await aRes.json()).items ?? [] : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [preview, groupBy, params]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    const r = rangeForPreset(p, from, to);
    setAllTime(r.allTime);
    setFrom(r.from);
    setTo(r.to);
  }

  // Typeahead suggestions: users + companies not already selected, matching query.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const u = options.users
      .filter((x) => !selUsers.includes(x.email) && x.email.toLowerCase().includes(q))
      .map((x) => ({ kind: "user" as const, value: x.email, label: x.email }));
    const c = options.companies
      .filter((x) => !selCompanies.includes(x.name) && x.name.toLowerCase().includes(q))
      .map((x) => ({ kind: "company" as const, value: x.name, label: x.name }));
    return [...c, ...u].slice(0, 8);
  }, [query, options, selUsers, selCompanies]);

  function addFilter(kind: "user" | "company", value: string) {
    if (kind === "user") setSelUsers((s) => [...new Set([...s, value])]);
    else setSelCompanies((s) => [...new Set([...s, value])]);
    setQuery("");
  }

  const sortedBreakdown = useMemo(() => {
    const rows = [...(data?.breakdown ?? [])];
    const dir = sortDir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "name": return dir * a.label.localeCompare(b.label);
        case "tokens": return dir * (a.tokens - b.tokens);
        case "recency": return dir * ((a.lastActivity ? Date.parse(a.lastActivity) : 0) - (b.lastActivity ? Date.parse(b.lastActivity) : 0));
        default: return dir * (a.costUsd - b.costUsd);
      }
    });
    return rows;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }
  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  const maxTokens = Math.max(1, ...(data?.series.map((s) => s.tokens) ?? [1]));
  const maxRow = Math.max(1, ...sortedBreakdown.map((r) => r.costUsd));

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-1">Usage & Activity</h1>
      <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">Token spend (USD) and behavioral activity across research, chat, and opens. Days are US Eastern. Cost is an estimate.</p>

      {/* Search / filter typeahead */}
      <div className="card p-4 mb-4">
        <label className="text-label mb-1 block">Search users & companies</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {selCompanies.map((c) => (
            <span key={`c-${c}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[rgba(50,137,255,0.08)] border border-[rgba(50,137,255,0.2)] text-xs text-slate-700 dark:text-slate-200">
              {c}<button onClick={() => setSelCompanies((s) => s.filter((x) => x !== c))} className="text-slate-400 hover:text-red-500">&times;</button>
            </span>
          ))}
          {selUsers.map((u) => (
            <span key={`u-${u}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700">
              {u}<button onClick={() => setSelUsers((s) => s.filter((x) => x !== u))} className="text-emerald-400 hover:text-red-500">&times;</button>
            </span>
          ))}
          <div className="relative flex-1 min-w-[180px]">
            <input
              className="input-field text-sm w-full"
              placeholder="Type a company or user…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full card p-1 max-h-64 overflow-auto shadow-lg">
                {suggestions.map((s) => (
                  <button
                    key={`${s.kind}-${s.value}`}
                    onClick={() => addFilter(s.kind, s.value)}
                    className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-[rgba(50,137,255,0.08)] flex items-center justify-between"
                  >
                    <span className="truncate">{s.label}</span>
                    <span className="text-[10px] uppercase text-slate-400 ml-2">{s.kind}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {(selUsers.length > 0 || selCompanies.length > 0) && (
            <button onClick={() => { setSelUsers([]); setSelCompanies([]); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
          )}
        </div>
      </div>

      {/* Date + group controls */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-label mb-1 block">Range</label>
          <select className="input-field text-sm" value={preset} onChange={(e) => applyPreset(e.target.value as Preset)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label mb-1 block">From</label>
          <input type="date" className="input-field text-sm" value={from} disabled={allTime} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} />
        </div>
        <div>
          <label className="text-label mb-1 block">To</label>
          <input type="date" className="input-field text-sm" value={to} disabled={allTime} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} />
        </div>
        <div>
          <label className="text-label mb-1 block">Group by</label>
          <select className="input-field text-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as Group)}>
            {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <button onClick={load} className="btn-ghost text-sm" disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-300 mb-4">{error}</div>}

      {data && (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-6">
            <div className="card p-4"><p className="text-2xl font-bold text-[#3289FF]">{fmtUsd(data.totals.costUsd)}</p><p className="text-label mt-1">Est. cost</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtTokens(data.totals.tokens)}</p><p className="text-label mt-1">Total tokens</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtTokens(data.totals.inputTokens)}</p><p className="text-label mt-1">Input</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtTokens(data.totals.outputTokens)}</p><p className="text-label mt-1">Output</p></div>
          </div>

          {data.series.length > 0 && (
            <div className="card p-4 mb-6">
              <p className="text-label mb-3">Daily tokens (ET)</p>
              <div className="flex items-end gap-1 h-24">
                {data.series.map((s) => (
                  <div key={s.day} className="flex-1 bg-[#3289FF]/70 rounded-t hover:bg-[#3289FF]" style={{ height: `${(s.tokens / maxTokens) * 100}%` }} title={`${s.day}: ${fmtTokens(s.tokens)} tokens · ${fmtUsd(s.costUsd)}`} />
                ))}
              </div>
            </div>
          )}

          <div className="card p-0 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">By {data.groupBy}</p></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-label border-b border-slate-100 dark:border-slate-700">
                <th className="px-4 py-2 cursor-pointer" onClick={() => toggleSort("name")}>{data.groupBy}{sortArrow("name")}</th>
                <th className="px-4 py-2 text-right">Input</th>
                <th className="px-4 py-2 text-right">Output</th>
                <th className="px-4 py-2 text-right cursor-pointer" onClick={() => toggleSort("tokens")}>Tokens{sortArrow("tokens")}</th>
                <th className="px-4 py-2 text-right cursor-pointer" onClick={() => toggleSort("cost")}>Est. cost{sortArrow("cost")}</th>
                <th className="px-4 py-2 text-right cursor-pointer" onClick={() => toggleSort("recency")}>Last active{sortArrow("recency")}</th>
              </tr></thead>
              <tbody>
                {sortedBreakdown.map((r) => (
                  <tr key={r.label} className="border-b border-slate-50 dark:border-slate-800 last:border-0">
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-1.5 rounded-full bg-[#3289FF]/40" style={{ width: `${Math.max(4, (r.costUsd / maxRow) * 80)}px` }} />
                        <span className="truncate max-w-[220px]">{r.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{fmtTokens(r.inputTokens)}</td>
                    <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{fmtTokens(r.outputTokens)}</td>
                    <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-200">{fmtTokens(r.tokens)}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-800 dark:text-slate-100">{fmtUsd(r.costUsd)}</td>
                    <td className="px-4 py-2 text-right text-slate-400 dark:text-slate-500 text-xs">{r.lastActivity ? fmtWhen(r.lastActivity) : "—"}</td>
                  </tr>
                ))}
                {sortedBreakdown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No usage in this range.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Activity feed */}
          {!preview && (
            <div className="card p-0 mb-6 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Activity</p></div>
              <div className="max-h-96 overflow-auto divide-y divide-slate-50 dark:divide-slate-800">
                {feed.map((f, i) => (
                  <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200 truncate">
                      <span className="font-medium">{f.userEmail.split("@")[0]}</span>
                      <span className="text-slate-400"> {FEED_LABEL[f.type]} </span>
                      <span>{f.label}</span>
                      {f.type === "research_run" && f.subtype && f.subtype !== "completed" && <span className="text-[10px] text-amber-500 ml-1">({f.subtype})</span>}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap ml-3">{fmtWhen(f.at)}</span>
                  </div>
                ))}
                {feed.length === 0 && <div className="px-4 py-6 text-center text-slate-400 text-sm">No activity in this range.</div>}
              </div>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">By model</p></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-label border-b border-slate-100 dark:border-slate-700">
                <th className="px-4 py-2">Model</th><th className="px-4 py-2 text-right">Tokens</th><th className="px-4 py-2 text-right">Est. cost</th>
              </tr></thead>
              <tbody>
                {data.models.map((m) => (
                  <tr key={m.model} className="border-b border-slate-50 dark:border-slate-800 last:border-0">
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{m.model}</td>
                    <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{fmtTokens(m.tokens)}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-800 dark:text-slate-100">{fmtUsd(m.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
