"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { StakeholderStatus } from "@/lib/types";

interface StakeholderRow {
  id: string;
  project_id: string;
  name: string;
  company: string | null;
  title: string | null;
  status: StakeholderStatus;
  progress: number;
  created_at: string;
}

const ACTIVE: StakeholderStatus[] = ["queued", "resolving", "scraping", "synthesizing"];

const STATUS_STYLES: Record<StakeholderStatus, string> = {
  queued: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
  resolving: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700",
  needs_confirmation: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700",
  scraping: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700",
  synthesizing: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700",
  failed: "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-slate-700",
  cancelled: "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800/60 dark:text-slate-500 dark:border-slate-700",
  departed: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
};

const STATUS_LABEL: Record<StakeholderStatus, string> = {
  queued: "Analyzing…",
  resolving: "Analyzing…",
  needs_confirmation: "Needs URL",
  scraping: "Analyzing…",
  synthesizing: "Analyzing…",
  completed: "Analyzed ✓",
  failed: "Failed",
  cancelled: "Cancelled",
  departed: "No longer at company",
};

export default function GlobalStakeholdersPage() {
  const [rows, setRows] = useState<StakeholderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/stakeholders");
      const data = await res.json();
      setRows(data.stakeholders || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasActive = rows.some((r) => ACTIVE.includes(r.status));
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [hasActive, fetchData]);

  const [showDeparted, setShowDeparted] = useState(false);

  const matchesQuery = (r: StakeholderRow) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.company || "").toLowerCase().includes(q) || (r.title || "").toLowerCase().includes(q);
  };

  const filtered = rows.filter((r) => r.status !== "departed" && matchesQuery(r));
  const departed = rows.filter((r) => r.status === "departed" && matchesQuery(r));

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF] mb-1 block cursor-pointer">&larr; Dashboard</Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">All Stakeholders</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{rows.length} deep-analyzed across all projects</p>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <input
          type="text"
          placeholder="Search by name, company, or title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input-field w-full"
        />
      </div>

      {loading ? (
        <div className="card p-4"><div className="h-10 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" /></div>
      ) : filtered.length === 0 && departed.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{rows.length === 0 ? "No stakeholders analyzed yet" : "No stakeholders match your search."}</p>
          {rows.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">Open a project and use &ldquo;Import Stakeholders&rdquo; to get started.</p>}
        </div>
      ) : filtered.length === 0 ? null : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] dark:border-slate-700 text-label">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Company</th>
                <th className="text-left p-3">Title</th>
                <th className="text-center p-3">Status</th>
                <th className="text-right p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-[#E2E8F0] dark:border-slate-700 last:border-0 hover:bg-[rgba(50,137,255,0.02)] transition-colors">
                  <td className="p-3">
                    <Link href={`/projects/${r.project_id}/stakeholder/${r.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#3289FF] transition-colors">
                      {r.name}
                    </Link>
                  </td>
                  <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{r.company || "—"}</td>
                  <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{r.title || "—"}</td>
                  <td className="p-3 text-center">
                    <span className={`badge border ${STATUS_STYLES[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="p-3 text-right">
                    {r.status === "completed" && (
                      <Link
                        href={`/projects/${r.project_id}/stakeholder/${r.id}`}
                        className="text-xs font-medium text-[#3289FF] hover:underline whitespace-nowrap"
                      >
                        View →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && departed.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowDeparted((v) => !v)}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
          >
            {showDeparted ? "Hide" : "Show"} departed / no longer at company ({departed.length})
          </button>
          {showDeparted && (
            <div className="card overflow-hidden mt-2 opacity-60">
              <table className="w-full text-sm">
                <tbody>
                  {departed.map((r) => (
                    <tr key={r.id} className="border-b border-[#E2E8F0] dark:border-slate-700 last:border-0">
                      <td className="p-3">
                        <Link href={`/projects/${r.project_id}/stakeholder/${r.id}`} className="text-sm font-medium text-slate-500 dark:text-slate-400 line-through hover:text-[#3289FF] transition-colors">
                          {r.name}
                        </Link>
                      </td>
                      <td className="p-3 text-xs text-slate-400 dark:text-slate-500">{r.company || "—"}</td>
                      <td className="p-3 text-xs text-slate-400 dark:text-slate-500">{r.title || "—"}</td>
                      <td className="p-3 text-center">
                        <span className={`badge border ${STATUS_STYLES[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
