"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/db";
import Link from "next/link";

const AGENT_LABELS: Record<string, string> = {
  company_profile: "Company Profile",
  tech_stack: "Tech Stack",
  financial_signal: "Financial Signal",
  trigger_scanner: "Trigger Scanner",
  pain_point_analyzer: "Pain Points",
  stakeholder_researcher: "Stakeholders",
  solution_mapper: "Solution Mapping",
  gtm_generator: "GTM Strategy",
  scoring_agent: "Scoring",
  verification: "Verification",
};

// Jobs older than 30 min with no progress are considered stale
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

interface Step {
  id: string;
  agent_name: string;
  status: string;
}

interface Job {
  id: string;
  project_id: string;
  company_name: string;
  status: string;
  progress: number;
  created_at: string;
  started_at: string | null;
  research_steps: Step[];
}

interface CompletedJob extends Job {
  slug?: string;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <span className="text-emerald-500 text-xs">&#10003;</span>;
    case "running":
      return <span className="w-2 h-2 rounded-full bg-[#3289FF] inline-block animate-pulse-dot" />;
    case "failed":
      return <span className="text-red-500 text-xs">&#10007;</span>;
    default:
      return <span className="w-2 h-2 rounded-full bg-slate-200 inline-block" />;
  }
}

function isStaleJob(job: Job): boolean {
  const refTime = job.started_at || job.created_at;
  if (!refTime) return false;
  return Date.now() - new Date(refTime).getTime() > STALE_THRESHOLD_MS;
}

export default function ProgressSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<CompletedJob[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  // Extract projectId from URL path (e.g. /projects/abc-123/...)
  const projectId = pathname?.match(/\/projects\/([^/]+)/)?.[1] || null;

  async function fetchJobs() {
    if (!projectId) {
      setActiveJobs([]);
      setRecentCompleted([]);
      return;
    }

    const supabase = createBrowserClient();

    // Fetch ALL jobs for this project (active = queued/running/failed)
    const { data: jobs } = await supabase
      .from("research_jobs")
      .select("id, project_id, company_name, status, progress, created_at, started_at, research_steps(id, agent_name, status)")
      .eq("project_id", projectId)
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (jobs) setActiveJobs(jobs as unknown as Job[]);

    // Fetch recently completed — join with company_profiles to get slug
    const { data: completed } = await supabase
      .from("research_jobs")
      .select("id, project_id, company_name, status, progress, created_at, started_at, research_steps(id, agent_name, status)")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(5);

    if (completed) {
      // Fetch slugs for completed jobs
      const jobIds = completed.map((j: any) => j.id);
      const { data: profiles } = await supabase
        .from("company_profiles")
        .select("job_id, slug, project_id")
        .in("job_id", jobIds);

      const slugMap = new Map((profiles || []).map((p: any) => [p.job_id, { slug: p.slug, project_id: p.project_id }]));

      setRecentCompleted(
        completed.map((j: any) => ({
          ...j,
          slug: slugMap.get(j.id)?.slug || j.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        })) as CompletedJob[]
      );
    }
  }

  async function handleDismiss(jobId: string) {
    setDismissing(jobId);
    try {
      await fetch(`/api/research/${jobId}`, { method: "DELETE" });
      // Remove from local state immediately
      setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch { /* ignore */ }
    setDismissing(null);
  }

  useEffect(() => {
    const supabase = createBrowserClient();

    fetchJobs();

    if (!projectId) return;

    const jobChannel = supabase
      .channel(`sidebar-jobs-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_jobs", filter: `project_id=eq.${projectId}` },
        () => fetchJobs()
      )
      .subscribe();

    const stepChannel = supabase
      .channel(`sidebar-steps-${projectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "research_steps" },
        () => fetchJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobChannel);
      supabase.removeChannel(stepChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const hasContent = activeJobs.length > 0 || recentCompleted.length > 0;

  return (
    <aside
      className={`border-r border-[#E2E8F0] bg-[#F8FAFF] transition-all duration-300 flex-shrink-0 overflow-y-auto ${
        collapsed ? "w-12" : "w-[300px]"
      }`}
      style={{ minHeight: "calc(100vh - 56px)" }}
    >
      <div className="flex items-center justify-between p-3 border-b border-[#E2E8F0]">
        {!collapsed && (
          <span className="text-label">Research Progress</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 text-xs cursor-pointer"
        >
          {collapsed ? "\u203A" : "\u2039"}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3">
          {!hasContent ? (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-[rgba(50,137,255,0.08)] flex items-center justify-center mx-auto mb-3">
                <span className="text-[#3289FF] text-lg">&#9729;</span>
              </div>
              <p className="text-xs text-slate-400">No active research</p>
              <p className="text-[10px] text-slate-300 mt-1">Add companies to a project to start</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active Jobs */}
              {activeJobs.map((job) => {
                const stale = isStaleJob(job);
                const isFailed = job.status === "failed";
                return (
                  <div key={job.id} className={`card p-3 ${isFailed ? "border-red-200 bg-red-50/30" : stale ? "border-amber-200 bg-amber-50/30" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-slate-700 truncate flex-1">{job.company_name}</p>
                      <div className="flex items-center gap-1.5">
                        {isFailed && (
                          <span className="text-[9px] text-red-500 font-medium">Failed</span>
                        )}
                        {!isFailed && stale && (
                          <span className="text-[9px] text-amber-500 font-medium">Stale</span>
                        )}
                        <span className={`text-[10px] font-medium ${isFailed ? "text-red-500" : "text-[#3289FF]"}`}>{job.progress}%</span>
                        <button
                          onClick={() => handleDismiss(job.id)}
                          disabled={dismissing === job.id}
                          className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-50 text-slate-300 hover:text-red-400 text-[10px] cursor-pointer transition-colors"
                          title="Dismiss"
                        >
                          &#10005;
                        </button>
                      </div>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isFailed ? "bg-red-400" : stale ? "bg-amber-400" : "bg-[#3289FF]"}`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      {job.research_steps
                        ?.sort((a, b) => {
                          const order = Object.keys(AGENT_LABELS);
                          return order.indexOf(a.agent_name) - order.indexOf(b.agent_name);
                        })
                        .map((step) => (
                          <div key={step.id} className="flex items-center gap-2">
                            <StatusIcon status={step.status} />
                            <span className={`text-[11px] ${
                              step.status === "completed" ? "text-slate-500" :
                              step.status === "running" ? "text-[#3289FF] font-medium" :
                              step.status === "failed" ? "text-red-500" :
                              "text-slate-300"
                            }`}>
                              {AGENT_LABELS[step.agent_name] || step.agent_name}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}

              {/* Recently Completed */}
              {recentCompleted.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="h-px bg-slate-200 flex-1" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Recent</span>
                    <div className="h-px bg-slate-200 flex-1" />
                  </div>
                  {recentCompleted.map((job) => (
                    <Link
                      key={job.id}
                      href={`/projects/${job.project_id}/company/${job.slug}`}
                      className="card p-3 block hover:border-[#3289FF]/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-600 truncate">{job.company_name}</p>
                        <span className="text-emerald-500 text-xs">&#10003;</span>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
