"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { StakeholderStatus } from "@/lib/types";
import StakeholderImport, { type StakeholderInput } from "@/components/StakeholderImport";

interface StakeholderRow {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  status: StakeholderStatus;
  progress: number;
  url_confidence: string | null;
  error_message: string | null;
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

interface PendingReuse {
  input: StakeholderInput;
  inputType: "manual" | "csv";
  updated_at: string | null;
  matched_name?: string;
  match_type?: "linkedin" | "domain" | "exact" | "similar";
}

export default function ProjectStakeholdersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [rows, setRows] = useState<StakeholderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingReuse, setPendingReuse] = useState<PendingReuse[]>([]);
  const [resolvingReuse, setResolvingReuse] = useState<string | null>(null);
  const [showDeparted, setShowDeparted] = useState(false);

  const activeRows = rows.filter((r) => r.status !== "departed");
  const departedRows = rows.filter((r) => r.status === "departed");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/stakeholders`);
      const data = await res.json();
      setRows(data.stakeholders || []);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasActive = rows.some((r) => ACTIVE.includes(r.status));
  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [hasActive, fetchData]);

  async function handleImport(people: StakeholderInput[], inputType: "manual" | "csv") {
    const res = await fetch(`/api/projects/${projectId}/stakeholders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stakeholders: people, inputType }),
    });
    const data = await res.json().catch(() => ({}));
    const found = (data?.existing ?? []) as { name: string; company: string | null; updated_at: string | null; matched_name?: string; match_type?: PendingReuse["match_type"] }[];
    if (found.length > 0) {
      const matched: PendingReuse[] = found
        .map((f): PendingReuse | null => {
          const input = people.find((p) => p.name === f.name && (p.company || null) === (f.company || null));
          return input ? { input, inputType, updated_at: f.updated_at, matched_name: f.matched_name, match_type: f.match_type } : null;
        })
        .filter((x): x is PendingReuse => x !== null);
      setPendingReuse((prev) => [...prev, ...matched]);
    }
    fetchData();
  }

  async function handleReuseDecision(item: PendingReuse, decision: "reuse" | "refresh") {
    const key = `${item.input.name}|${item.input.company || ""}`;
    setResolvingReuse(key);
    await fetch(`/api/projects/${projectId}/stakeholders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stakeholders: [item.input],
        inputType: item.inputType,
        ...(decision === "reuse" ? { reuse: true } : { forceRefresh: true }),
      }),
    });
    setPendingReuse((prev) => prev.filter((p) => `${p.input.name}|${p.input.company || ""}` !== key));
    setResolvingReuse(null);
    fetchData();
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF] mb-1 block cursor-pointer">
            &larr; Project
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Stakeholders</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{rows.length} deep-analyzed {rows.length === 1 ? "person" : "people"}</p>
        </div>
        <StakeholderImport onSubmit={handleImport} />
      </div>

      {pendingReuse.length > 0 && (
        <div className="mb-6 space-y-2">
          {pendingReuse.map((item) => {
            const key = `${item.input.name}|${item.input.company || ""}`;
            return (
              <div key={key} className="card p-4 flex items-center justify-between border-amber-200 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-900/30">
                <div>
                  {item.match_type === "similar" ? (
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Possible match: <span className="font-semibold">{item.matched_name || item.input.name}</span> already analyzed — same person?
                      <span className="text-slate-500 dark:text-slate-400 font-normal"> (you entered &ldquo;{item.input.name}&rdquo;)</span>
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      <span className="font-semibold">{item.matched_name || item.input.name}</span>
                      {item.input.company ? ` @ ${item.input.company}` : ""} already analyzed
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Last updated {item.updated_at ? new Date(item.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "recently"} &middot; reusing skips the LinkedIn scrape
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReuseDecision(item, "reuse")}
                    disabled={resolvingReuse === key}
                    className="btn-primary disabled:opacity-50"
                  >
                    {resolvingReuse === key ? "Working..." : "Use existing"}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("Re-analyzing runs a fresh LinkedIn scrape (paid). The existing profile is still up to date — re-analyze anyway?")) {
                        handleReuseDecision(item, "refresh");
                      }
                    }}
                    disabled={resolvingReuse === key}
                    title="Runs a fresh paid scrape"
                    className="btn-ghost text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-50"
                  >
                    Re-analyze (paid)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="card p-4"><div className="h-10 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No stakeholders analyzed yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Use &ldquo;Import Stakeholders&rdquo; to deep-analyze individuals by name + company.</p>
        </div>
      ) : activeRows.length === 0 ? null : (
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
              {activeRows.map((r) => {
                const active = ACTIVE.includes(r.status);
                return (
                  <tr key={r.id} className="border-b border-[#E2E8F0] dark:border-slate-700 last:border-0 hover:bg-[rgba(50,137,255,0.02)] transition-colors">
                    <td className="p-3">
                      <Link href={`/projects/${projectId}/stakeholder/${r.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#3289FF] transition-colors">
                        {r.name}
                      </Link>
                      {active && (
                        <div className="w-32 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-[#3289FF] rounded-full transition-all duration-500" style={{ width: `${r.progress || 5}%` }} />
                        </div>
                      )}
                      {r.status === "failed" && r.error_message && (
                        <p className="text-[10px] text-red-400 dark:text-red-300 mt-0.5 truncate max-w-xs">{r.error_message}</p>
                      )}
                      {r.status === "departed" && r.error_message && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-xs">{r.error_message}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{r.company || "—"}</td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{r.title || "—"}</td>
                    <td className="p-3 text-center">
                      <span className={`badge border ${STATUS_STYLES[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="p-3 text-right">
                      {r.status === "completed" && (
                        <Link
                          href={`/projects/${projectId}/stakeholder/${r.id}`}
                          className="text-xs font-medium text-[#3289FF] hover:underline whitespace-nowrap"
                        >
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && departedRows.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowDeparted((v) => !v)}
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
          >
            {showDeparted ? "Hide" : "Show"} departed / no longer at company ({departedRows.length})
          </button>
          {showDeparted && (
            <div className="card overflow-hidden mt-2 opacity-60">
              <table className="w-full text-sm">
                <tbody>
                  {departedRows.map((r) => (
                    <tr key={r.id} className="border-b border-[#E2E8F0] dark:border-slate-700 last:border-0">
                      <td className="p-3">
                        <Link href={`/projects/${projectId}/stakeholder/${r.id}`} className="text-sm font-medium text-slate-500 dark:text-slate-400 line-through hover:text-[#3289FF] transition-colors">
                          {r.name}
                        </Link>
                        {r.error_message && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-xs">{r.error_message}</p>
                        )}
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
