"use client";

import { useEffect, useState, useCallback } from "react";

type Group = "company" | "project" | "user" | "model" | "agent" | "phase";

interface Row { label: string; tokens: number; inputTokens: number; outputTokens: number; costUsd: number; }
interface ModelRow { model: string; tokens: number; inputTokens: number; outputTokens: number; costUsd: number; }
interface SeriesPoint { day: string; tokens: number; costUsd: number; }
interface UsageResponse {
  groupBy: Group;
  totals: { inputTokens: number; outputTokens: number; tokens: number; costUsd: number };
  breakdown: Row[];
  models: ModelRow[];
  series: SeriesPoint[];
}

const GROUPS: { id: Group; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "project", label: "Project" },
  { id: "user", label: "User" },
  { id: "model", label: "Model" },
  { id: "agent", label: "Agent" },
  { id: "phase", label: "Phase" },
];

const fmtTokens = (n: number) => n.toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function UsageDashboard({ preview }: { preview?: (g: Group) => UsageResponse }) {
  const [groupBy, setGroupBy] = useState<Group>("company");
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [data, setData] = useState<UsageResponse | null>(preview ? preview("company") : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (preview) { setData(preview(groupBy)); return; } // demo mode — no network
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ groupBy, from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` });
      const res = await fetch(`/api/admin/usage?${params}`);
      if (!res.ok) throw new Error(res.status === 403 ? "Not authorized" : `Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [groupBy, from, to, preview]);

  useEffect(() => { load(); }, [load]);

  const maxTokens = Math.max(1, ...(data?.series.map((s) => s.tokens) ?? [1]));
  const maxRow = Math.max(1, ...(data?.breakdown.map((r) => r.costUsd) ?? [1]));

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-1">LLM Usage</h1>
      <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">Token consumption &amp; estimated cost across research and chat. Cost is an estimate.</p>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-label mb-1 block">Group by</label>
          <select className="input-field text-sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as Group)}>
            {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label mb-1 block">From</label>
          <input type="date" className="input-field text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-label mb-1 block">To</label>
          <input type="date" className="input-field text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={load} className="btn-ghost text-sm" disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-300 mb-4">{error}</div>}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid sm:grid-cols-4 gap-3 mb-6">
            <div className="card p-4"><p className="text-2xl font-bold text-[#3289FF]">{fmtUsd(data.totals.costUsd)}</p><p className="text-label mt-1">Est. cost</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtTokens(data.totals.tokens)}</p><p className="text-label mt-1">Total tokens</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtTokens(data.totals.inputTokens)}</p><p className="text-label mt-1">Input</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtTokens(data.totals.outputTokens)}</p><p className="text-label mt-1">Output</p></div>
          </div>

          {/* Daily sparkline */}
          {data.series.length > 0 && (
            <div className="card p-4 mb-6">
              <p className="text-label mb-3">Daily tokens</p>
              <div className="flex items-end gap-1 h-24">
                {data.series.map((s) => (
                  <div key={s.day} className="flex-1 bg-[#3289FF]/70 rounded-t hover:bg-[#3289FF]" style={{ height: `${(s.tokens / maxTokens) * 100}%` }} title={`${s.day}: ${fmtTokens(s.tokens)} tokens · ${fmtUsd(s.costUsd)}`} />
                ))}
              </div>
            </div>
          )}

          {/* Breakdown by group */}
          <div className="card p-0 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">By {data.groupBy}</p></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-label border-b border-slate-100 dark:border-slate-700">
                <th className="px-4 py-2">{data.groupBy}</th><th className="px-4 py-2 text-right">Input</th><th className="px-4 py-2 text-right">Output</th><th className="px-4 py-2 text-right">Tokens</th><th className="px-4 py-2 text-right">Est. cost</th>
              </tr></thead>
              <tbody>
                {data.breakdown.map((r) => (
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
                  </tr>
                ))}
                {data.breakdown.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No usage in this range.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* By model */}
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
