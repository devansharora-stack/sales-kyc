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
  queued: "bg-slate-50 text-slate-500 border-slate-200",
  resolving: "bg-blue-50 text-blue-600 border-blue-200",
  needs_confirmation: "bg-amber-50 text-amber-700 border-amber-200",
  scraping: "bg-blue-50 text-blue-600 border-blue-200",
  synthesizing: "bg-blue-50 text-blue-600 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-600 border-red-200",
  cancelled: "bg-slate-50 text-slate-400 border-slate-200",
};

const STATUS_LABEL: Record<StakeholderStatus, string> = {
  queued: "Queued",
  resolving: "Resolving",
  needs_confirmation: "Needs URL",
  scraping: "Scraping",
  synthesizing: "Synthesizing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default function ProjectStakeholdersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [rows, setRows] = useState<StakeholderRow[]>([]);
  const [loading, setLoading] = useState(true);

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
    await fetch(`/api/projects/${projectId}/stakeholders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stakeholders: people, inputType }),
    });
    fetchData();
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 hover:text-[#3289FF] mb-1 block cursor-pointer">
            &larr; Project
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Stakeholders</h1>
          <p className="text-sm text-slate-400 mt-0.5">{rows.length} deep-analyzed {rows.length === 1 ? "person" : "people"}</p>
        </div>
        <StakeholderImport onSubmit={handleImport} />
      </div>

      {loading ? (
        <div className="card p-4"><div className="h-10 bg-slate-50 rounded animate-pulse" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-slate-500 mb-1">No stakeholders analyzed yet</p>
          <p className="text-xs text-slate-400">Use &ldquo;Import Stakeholders&rdquo; to deep-analyze individuals by name + company.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-label">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Company</th>
                <th className="text-left p-3">Title</th>
                <th className="text-center p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = ACTIVE.includes(r.status);
                return (
                  <tr key={r.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[rgba(50,137,255,0.02)] transition-colors">
                    <td className="p-3">
                      <Link href={`/projects/${projectId}/stakeholder/${r.id}`} className="text-sm font-medium text-slate-700 hover:text-[#3289FF] transition-colors">
                        {r.name}
                      </Link>
                      {active && (
                        <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-[#3289FF] rounded-full transition-all duration-500" style={{ width: `${r.progress || 5}%` }} />
                        </div>
                      )}
                      {r.status === "failed" && r.error_message && (
                        <p className="text-[10px] text-red-400 mt-0.5 truncate max-w-xs">{r.error_message}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{r.company || "—"}</td>
                    <td className="p-3 text-xs text-slate-500">{r.title || "—"}</td>
                    <td className="p-3 text-center">
                      <span className={`badge border ${STATUS_STYLES[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
