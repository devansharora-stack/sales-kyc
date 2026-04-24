"use client";

import { useEffect, useState } from "react";
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
  research_steps: Step[];
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

export default function ProgressSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Job[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();

    // Fetch active jobs on mount
    async function fetchJobs() {
      const { data: jobs } = await supabase
        .from("research_jobs")
        .select("id, project_id, company_name, status, progress, research_steps(id, agent_name, status)")
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (jobs) setActiveJobs(jobs as unknown as Job[]);

      // Also fetch recently completed (last 5)
      const { data: completed } = await supabase
        .from("research_jobs")
        .select("id, project_id, company_name, status, progress, research_steps(id, agent_name, status)")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5);

      if (completed) setRecentCompleted(completed as unknown as Job[]);
    }

    fetchJobs();

    // Subscribe to research_jobs changes
    const jobChannel = supabase
      .channel("sidebar-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_jobs" },
        () => {
          // Refetch on any change
          fetchJobs();
        }
      )
      .subscribe();

    // Subscribe to research_steps changes for progress updates
    const stepChannel = supabase
      .channel("sidebar-steps")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "research_steps" },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobChannel);
      supabase.removeChannel(stepChannel);
    };
  }, []);

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
              {activeJobs.map((job) => (
                <div key={job.id} className="card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-700 truncate">{job.company_name}</p>
                    <span className="text-[10px] text-[#3289FF] font-medium">{job.progress}%</span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-[#3289FF] rounded-full transition-all duration-500"
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
              ))}

              {/* Recently Completed */}
              {recentCompleted.length > 0 && (
                <>
                  {activeJobs.length > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                      <div className="h-px bg-slate-200 flex-1" />
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Recent</span>
                      <div className="h-px bg-slate-200 flex-1" />
                    </div>
                  )}
                  {recentCompleted.map((job) => (
                    <Link
                      key={job.id}
                      href={`/projects/${job.project_id}`}
                      className="card p-3 block hover:border-[#3289FF]/30"
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
