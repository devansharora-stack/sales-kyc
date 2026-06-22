"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="card p-4 block">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{project.description}</p>
          )}
          <p className="text-[10px] text-slate-300 dark:text-slate-500 mt-1">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-bold text-[#3289FF]">{project.company_count}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">companies</p>
          </div>
          <span className={`badge ${project.status === "active" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500"}`}>
            {project.status}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const activeProjects = projects.filter((p) => p.status === "active");
  const archivedProjects = projects.filter((p) => p.status !== "active");

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Projects</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">All research projects across your workspace</p>
        </div>
        <Link href="/projects/new" className="btn-primary gap-2">
          <span>+</span> New Project
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  <div className="h-3 w-56 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" />
                </div>
                <div className="h-8 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-400 dark:text-red-300 text-xl">!</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Failed to load projects.</p>
          <button onClick={() => window.location.reload()} className="btn-ghost text-sm">
            Try Again
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && projects.length === 0 && (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-[rgba(50,137,255,0.08)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#3289FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No projects yet</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">Create a project and add companies to start AI-powered research</p>
          <Link href="/projects/new" className="btn-primary">
            Create First Project
          </Link>
        </div>
      )}

      {/* Projects */}
      {!loading && !error && projects.length > 0 && (
        <>
          {archivedProjects.length > 0 && (
            <div className="mb-4 flex items-center justify-end">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF]"
              >
                {showArchived ? "Hide" : "Show"} archived ({archivedProjects.length})
              </button>
            </div>
          )}

          <div className="space-y-3">
            {activeProjects.length > 0 ? (
              activeProjects.map((project) => <ProjectCard key={project.id} project={project} />)
            ) : (
              <div className="card p-8 text-center">
                <p className="text-sm text-slate-400 dark:text-slate-500">No active projects. {archivedProjects.length > 0 ? "Show archived above or create a new one." : ""}</p>
              </div>
            )}

            {showArchived && archivedProjects.length > 0 && (
              <div className="pt-4">
                <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Archived</h2>
                <div className="space-y-3 opacity-70">
                  {archivedProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
