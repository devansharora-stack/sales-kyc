"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="card p-4 block">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-slate-400 mt-0.5">{project.description}</p>
          )}
          <p className="text-[10px] text-slate-300 mt-1">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-bold text-[#3289FF]">{project.company_count}</p>
            <p className="text-[10px] text-slate-400">companies</p>
          </div>
          <span className={`badge ${project.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"}`}>
            {project.status}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stakeholdersAnalyzed, setStakeholdersAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setProjects(data.projects || []);
        setStakeholdersAnalyzed(data.stakeholdersAnalyzed || 0);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const activeProjects = projects.filter((p) => p.status === "active");
  const archivedProjects = projects.filter((p) => p.status !== "active");
  const totalCompanies = projects.reduce((sum, p) => sum + p.company_count, 0);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">AI-powered company research & GTM intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/solutions" className="btn-ghost text-sm text-[#3289FF]">
            Solution Repository
          </Link>
          <Link href="/projects/new" className="btn-primary gap-2">
            <span>+</span> New Project
          </Link>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-5">
            <p className="text-2xl font-bold text-[#3289FF]">{activeProjects.length}</p>
            <p className="text-label mt-1">Active Projects</p>
          </div>
          <div className="card p-5">
            <p className="text-2xl font-bold text-[#3289FF]">{totalCompanies}</p>
            <p className="text-label mt-1">Companies Researched</p>
          </div>
          <div className="card p-5">
            <p className="text-2xl font-bold text-[#3289FF]">{stakeholdersAnalyzed}</p>
            <p className="text-label mt-1">Stakeholders Analyzed</p>
          </div>
        </div>
      )}

      {/* Recent Projects header */}
      {!loading && !error && projects.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">Recent Projects</h2>
          <Link href="/projects" className="text-xs text-slate-400 hover:text-[#3289FF]">
            View all projects →
          </Link>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-5">
                <div className="h-7 w-12 bg-slate-100 rounded animate-pulse mb-2" />
                <div className="h-3 w-20 bg-slate-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="h-5 w-28 bg-slate-100 rounded animate-pulse" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
                  <div className="h-3 w-56 bg-slate-50 rounded animate-pulse" />
                </div>
                <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-sm text-slate-500 mb-3">Failed to load projects.</p>
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
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No projects yet</h3>
          <p className="text-sm text-slate-400 mb-4">Create a project and add companies to start AI-powered research</p>
          <Link href="/projects/new" className="btn-primary">
            Create First Project
          </Link>
        </div>
      )}

      {/* Projects preview */}
      {!loading && !error && projects.length > 0 && (
        <div className="space-y-3">
          {activeProjects.length > 0 ? (
            <>
              {activeProjects.slice(0, 4).map((project) => <ProjectCard key={project.id} project={project} />)}
              {activeProjects.length > 4 && (
                <Link href="/projects" className="block text-center text-xs text-slate-400 hover:text-[#3289FF] py-2">
                  View all {activeProjects.length} projects →
                </Link>
              )}
            </>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-sm text-slate-400">No active projects. {archivedProjects.length > 0 ? <Link href="/projects" className="text-[#3289FF] hover:underline">See archived</Link> : ""} or create a new one.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
