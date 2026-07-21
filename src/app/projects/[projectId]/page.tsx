"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Project, ResearchJob, ResearchStep, Rating, SalesIntelligence, SalesMotionType } from "@/lib/types";
import CSVUpload from "@/components/CSVUpload";
import ShareButton from "@/components/ShareButton";

const RATING_STYLES: Record<Rating, string> = {
  A: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700",
  B: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700",
  C: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700",
  D: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-slate-700",
  E: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-slate-700",
  F: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
};

interface CompanyRow {
  id: string;
  slug: string;
  total_score: number;
  rating: Rating;
  industry: string;
  urgency: string;
  primary_solution: string;
  gemini_status: string;
  name: string;
  fullName: string;
  hqCity: string;
  state: string;
  salesIntelligence?: SalesIntelligence;
}

type SortKey = "score" | "opportunity" | "motion" | "rating";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Account Score" },
  { key: "opportunity", label: "Opportunity Value" },
  { key: "motion", label: "Sales Motion" },
  { key: "rating", label: "Rating" },
];

const MOTION_STYLES: Record<SalesMotionType, string> = {
  "Quick Win": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700",
  "Land & Expand": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700",
  "Strategic Sale": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700",
  "Long Cycle": "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-slate-700",
};

function sortProfiles(profiles: CompanyRow[], sortBy: SortKey): CompanyRow[] {
  return [...profiles].sort((a, b) => {
    switch (sortBy) {
      case "score":
        return (b.total_score ?? 0) - (a.total_score ?? 0);
      case "opportunity":
        return (b.salesIntelligence?.opportunityValue?.score ?? 0) - (a.salesIntelligence?.opportunityValue?.score ?? 0);
      case "motion":
        return (b.salesIntelligence?.salesMotion?.score ?? 0) - (a.salesIntelligence?.salesMotion?.score ?? 0);
      case "rating": {
        const order: Record<string, number> = { A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 };
        return (order[b.rating] ?? 0) - (order[a.rating] ?? 0);
      }
      default:
        return 0;
    }
  });
}

interface JobWithSteps extends ResearchJob {
  research_steps: ResearchStep[];
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [profiles, setProfiles] = useState<CompanyRow[]>([]);
  const [jobs, setJobs] = useState<JobWithSteps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [addingCompanies, setAddingCompanies] = useState(false);
  const [newCompanies, setNewCompanies] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [pendingReuse, setPendingReuse] = useState<{ company_name: string; matched_name?: string; slug: string; updated_at: string | null; days_old?: number | null; source_project?: string | null; match_type?: "domain" | "exact" | "similar" }[]>([]);
  const [resolvingReuse, setResolvingReuse] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, compRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/companies`),
      ]);
      if (!projRes.ok) throw new Error();
      const [projData, compData] = await Promise.all([projRes.json(), compRes.json()]);
      setProject(projData.project);
      setProfiles(compData.profiles || []);
      setJobs(compData.jobs || []);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Record a passive "project opened" activity event (best-effort telemetry for
  // the admin usage dashboard). Fires once per project view; never blocks.
  useEffect(() => {
    if (!projectId) return;
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "project_open", projectId }),
    }).catch(() => {});
  }, [projectId]);

  // Poll for live progress while any job is active (replaces Supabase Realtime).
  const hasActiveJobs = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [hasActiveJobs, fetchData]);

  async function postCompanies(names: string[], opts?: { reuse?: boolean; forceRefresh?: boolean }) {
    const res = await fetch(`/api/projects/${projectId}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companies: names, ...opts }),
    });
    const data = await res.json().catch(() => ({}));
    const found = (data?.existing ?? []) as { company_name: string; matched_name?: string; slug: string; updated_at: string | null; days_old?: number | null; source_project?: string | null; match_type?: "domain" | "exact" | "similar" }[];
    if (found.length > 0) {
      setPendingReuse((prev) => {
        const seen = new Set(prev.map((p) => p.slug));
        return [...prev, ...found.filter((f) => !seen.has(f.slug))];
      });
    }
  }

  async function handleAddCompanies() {
    const names = newCompanies.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    setAddingCompanies(true);
    await postCompanies(names);
    setNewCompanies("");
    setAddingCompanies(false);
    fetchData();
  }

  async function handleReuseDecision(name: string, decision: "reuse" | "refresh") {
    setResolvingReuse(name);
    await postCompanies([name], decision === "reuse" ? { reuse: true } : { forceRefresh: true });
    setPendingReuse((prev) => prev.filter((p) => p.company_name !== name));
    setResolvingReuse(null);
    fetchData();
  }

  async function handleRetry(jobId: string, companyName: string) {
    setRetrying(jobId);
    // Retry means the user explicitly wants a fresh run — skip the cache.
    await postCompanies([companyName], { forceRefresh: true });
    setRetrying(null);
    fetchData();
  }

  async function handleArchive() {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    router.push("/");
  }

  async function handleDelete() {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.push("/");
  }

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4 py-8">
        <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-6 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mb-1" />
              <div className="h-3 w-16 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="card p-4"><div className="h-10 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" /></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
          <span className="text-red-400 dark:text-red-300 text-xl">!</span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Project not found or failed to load.</p>
        <button onClick={() => router.push("/")} className="btn-ghost text-sm">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push("/")} className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF] mb-1 cursor-pointer">
            &larr; Dashboard
          </button>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${project.status === "active" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-slate-50 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500"}`}>
            {project.status}
          </span>
          <button onClick={handleArchive} className="btn-ghost text-xs">
            {project.status === "active" ? "Archive" : "Unarchive"}
          </button>
          <ShareButton resourceType="project" resourceId={projectId} />
          <Link
            href={`/projects/${projectId}/stakeholders`}
            className="btn-ghost text-xs text-[#3289FF]"
          >
            Stakeholders
          </Link>
          <button
            onClick={() => { if (confirm("Delete this project and all its data?")) handleDelete(); }}
            className="btn-ghost text-xs text-red-400 dark:text-red-300 hover:text-red-600 hover:border-red-200"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xl font-bold text-[#3289FF]">{profiles.length}</p>
          <p className="text-label">Completed</p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-bold text-amber-500">{activeJobs.length}</p>
          <p className="text-label">In Progress</p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-bold text-red-500">{failedJobs.length}</p>
          <p className="text-label">Failed</p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-bold text-slate-400 dark:text-slate-500">{jobs.length}</p>
          <p className="text-label">Total Jobs</p>
        </div>
      </div>

      {/* Add More Companies */}
      <div className="card p-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            className="input-field flex-1"
            placeholder="Add companies or paste URLs (comma-separated)"
            value={newCompanies}
            onChange={(e) => setNewCompanies(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCompanies();
            }}
          />
          <button
            onClick={handleAddCompanies}
            disabled={addingCompanies || !newCompanies.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {addingCompanies ? "Adding..." : "Add & Research"}
          </button>
          <CSVUpload
            existingSlugs={profiles.map((p) => p.slug)}
            onSubmit={async (companies) => {
              await postCompanies(companies);
              fetchData();
            }}
          />
        </div>
      </div>

      {/* Existing-research prompts */}
      {pendingReuse.length > 0 && (
        <div className="mb-6 space-y-2">
          {pendingReuse.map((p) => (
            <div key={p.slug} className="card p-4 flex items-center justify-between border-amber-200 dark:border-slate-700 bg-amber-50/40 dark:bg-amber-900/30">
              <div>
                {p.match_type === "similar" ? (
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    Possible match: <span className="font-semibold">{p.matched_name || p.company_name}</span> — did you mean this?
                    <span className="text-slate-500 dark:text-slate-400 font-normal"> (you entered &ldquo;{p.company_name}&rdquo;)</span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    Found recent research for <span className="font-semibold">{p.matched_name || p.company_name}</span>
                    {typeof p.days_old === "number" && (
                      <span className="text-slate-500 dark:text-slate-400 font-normal"> ({p.days_old === 0 ? "today" : `${p.days_old} day${p.days_old === 1 ? "" : "s"} old`})</span>
                    )}
                  </p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Last researched {p.updated_at ? new Date(p.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "recently"}
                  {p.source_project ? ` · in "${p.source_project}"` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReuseDecision(p.company_name, "reuse")}
                  disabled={resolvingReuse === p.company_name}
                  className="btn-primary disabled:opacity-50"
                >
                  {resolvingReuse === p.company_name ? "Working..." : "Use existing"}
                </button>
                <button
                  onClick={() => handleReuseDecision(p.company_name, "refresh")}
                  disabled={resolvingReuse === p.company_name}
                  className="btn-ghost disabled:opacity-50"
                >
                  Refresh now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Research */}
      {activeJobs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Active Research</h2>
          <div className="space-y-2">
            {activeJobs.map((job) => {
              const completedSteps = job.research_steps?.filter((s) => s.status === "completed").length || 0;
              const totalSteps = job.research_steps?.length || 10;
              const runningStep = job.research_steps?.find((s) => s.status === "running");
              return (
                <Link key={job.id} href={`/projects/${projectId}/research/${job.id}`} className="card p-3 block hover:border-[#3289FF]/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{job.company_name}</p>
                    <span className="text-[10px] text-[#3289FF] font-medium">{completedSteps}/{totalSteps}</span>
                  </div>
                  {runningStep && (
                    <p className="text-[10px] text-[#3289FF] mb-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3289FF] inline-block animate-pulse-dot" />
                      Running: {runningStep.agent_name.replace(/_/g, " ")}
                    </p>
                  )}
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3289FF] rounded-full transition-all duration-500"
                      style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed Jobs */}
      {failedJobs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-red-500 dark:text-red-300 mb-3">Failed Research</h2>
          <div className="space-y-2">
            {failedJobs.map((job) => (
              <div key={job.id} className="card p-3 border-red-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{job.company_name}</p>
                    {job.error_message && (
                      <p className="text-[10px] text-red-400 dark:text-red-300 mt-0.5 truncate max-w-md">{job.error_message}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRetry(job.id, job.company_name)}
                    disabled={retrying === job.id}
                    className="btn-ghost text-xs text-[#3289FF] disabled:opacity-50"
                  >
                    {retrying === job.id ? "Retrying..." : "Retry"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Companies */}
      {profiles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Company Profiles</h2>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mr-1">Sort by</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    sortBy === opt.key
                      ? "bg-[#3289FF] text-white border-[#3289FF]"
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] dark:border-slate-700 text-label">
                  <th className="text-left p-3">Company</th>
                  <th className="text-left p-3">Industry</th>
                  <th className="text-center p-3">Score</th>
                  <th className="text-center p-3">Rating</th>
                  <th className="text-center p-3">Opp Value</th>
                  <th className="text-center p-3">Sales Motion</th>
                  <th className="text-center p-3">Urgency</th>
                  <th className="text-left p-3">Solution</th>
                </tr>
              </thead>
              <tbody>
                {sortProfiles(profiles, sortBy).map((p) => (
                  <tr key={p.id} className="border-b border-[#E2E8F0] dark:border-slate-700 last:border-0 hover:bg-[rgba(50,137,255,0.02)] transition-colors">
                    <td className="p-3">
                      <Link
                        href={`/projects/${projectId}/company/${p.slug}`}
                        className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#3289FF] transition-colors"
                      >
                        {p.name || p.slug}
                      </Link>
                      {p.hqCity && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">{p.hqCity}, {p.state}</p>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{p.industry}</td>
                    <td className="p-3 text-center">
                      <span className="text-sm font-bold text-[#3289FF]">{p.total_score}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`badge border ${RATING_STYLES[p.rating]}`}>
                        {p.rating}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {p.salesIntelligence?.opportunityValue ? (
                        <span className={`text-sm font-bold ${
                          p.salesIntelligence.opportunityValue.score >= 7 ? "text-emerald-600" :
                          p.salesIntelligence.opportunityValue.score >= 5 ? "text-[#3289FF]" :
                          "text-amber-600"
                        }`}>
                          {p.salesIntelligence.opportunityValue.score}
                          <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">/10</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {p.salesIntelligence?.salesMotion ? (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          MOTION_STYLES[p.salesIntelligence.salesMotion.motion] || "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700"
                        }`}>
                          {p.salesIntelligence.salesMotion.motion}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">{p.urgency}</td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{p.primary_solution?.replace(/-/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {profiles.length === 0 && activeJobs.length === 0 && failedJobs.length === 0 && (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-[rgba(50,137,255,0.08)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#3289FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No companies added yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Use the input above to add company names for AI-powered research.</p>
        </div>
      )}
    </div>
  );
}
