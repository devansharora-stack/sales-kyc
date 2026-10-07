"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/types";

type SortKey = "recent" | "name" | "companies" | "status";
type StatusFilter = "all" | "active" | "archived";

interface SearchResult {
  projects: { id: string; name: string; status: string; company_count: number }[];
  companies: {
    name: string;
    slug: string;
    projectId: string | null;
    projectName: string | null;
    totalScore: number | null;
    rating: string | null;
    industry: string | null;
  }[];
}

function ProjectRow({
  project,
  onUnarchive,
}: {
  project: Project;
  onUnarchive?: (id: string) => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <Link href={`/projects/${project.id}`} className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-[#3289FF]">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{project.description}</p>
          )}
          <p className="text-[10px] text-slate-300 dark:text-slate-500 mt-1">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </Link>
        <div className="flex items-center gap-4 pl-4">
          <div className="text-right">
            <p className="text-sm font-bold text-[#3289FF]">{project.company_count}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">companies</p>
          </div>
          <span className={`badge ${project.status === "active" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500"}`}>
            {project.status}
          </span>
          {project.status !== "active" && onUnarchive && (
            <button
              onClick={() => onUnarchive(project.id)}
              className="text-xs text-[#3289FF] hover:underline whitespace-nowrap"
            >
              Un-archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [showAdd, setShowAdd] = useState(false);

  function load() {
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
  }

  useEffect(load, []);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { projects: [], companies: [] }))
        .then((d: SearchResult) => setResults(d))
        .catch(() => setResults({ projects: [], companies: [] }))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function handleUnarchive(id: string) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    load();
  }

  const archivedCount = projects.filter((p) => p.status !== "active").length;

  const visible = useMemo(() => {
    let list = projects;
    if (statusFilter === "active") list = list.filter((p) => p.status === "active");
    else if (statusFilter === "archived") list = list.filter((p) => p.status !== "active");
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "companies":
          return b.company_count - a.company_count;
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [projects, statusFilter, sortKey]);

  const isSearchMode = query.trim().length > 0;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Projects</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">All research projects across your workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(true)} className="btn-ghost text-sm text-[#3289FF]">
            Add existing company
          </button>
          <Link href="/projects/new" className="btn-primary gap-2">
            <span>+</span> New Project
          </Link>
        </div>
      </div>

      {/* Search + controls */}
      {!error && (
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-0">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects or companies…"
              className="input-field w-full pl-9"
            />
          </div>
          {!isSearchMode && (
            <>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="input-field text-sm shrink-0 !w-auto"
                aria-label="Sort projects"
              >
                <option value="recent">Recent</option>
                <option value="name">Name A–Z</option>
                <option value="companies">Most companies</option>
                <option value="status">Status</option>
              </select>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                {(["active", "all", "archived"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-2 capitalize ${statusFilter === f ? "bg-[#3289FF] text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                  >
                    {f}
                    {f === "archived" && archivedCount > 0 ? ` (${archivedCount})` : ""}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

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

      {/* Empty (no projects at all) */}
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

      {/* Search results */}
      {!loading && !error && isSearchMode && (
        <div className="space-y-6">
          {searching && <p className="text-xs text-slate-400">Searching…</p>}
          {results && (
            <>
              <div>
                <h2 className="text-label mb-2">Projects ({results.projects.length})</h2>
                {results.projects.length === 0 ? (
                  <p className="text-xs text-slate-300 dark:text-slate-600">No matching projects</p>
                ) : (
                  <div className="space-y-2">
                    {results.projects.map((p) => (
                      <Link key={p.id} href={`/projects/${p.id}`} className="card p-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{p.name}</span>
                        <span className="text-xs text-slate-400">{p.company_count} companies · {p.status}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-label mb-2">Companies ({results.companies.length})</h2>
                {results.companies.length === 0 ? (
                  <p className="text-xs text-slate-300 dark:text-slate-600">No matching companies</p>
                ) : (
                  <div className="space-y-2">
                    {results.companies.map((c) => (
                      <Link
                        key={`${c.projectId}-${c.slug}`}
                        href={c.projectId ? `/projects/${c.projectId}/company/${c.slug}` : "#"}
                        className="card p-3 flex items-center justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{c.name}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">
                            {c.industry || "—"}{c.projectName ? ` · in ${c.projectName}` : ""}
                          </span>
                        </span>
                        <span className="text-sm font-bold text-[#3289FF] pl-3">{c.totalScore ?? "—"}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Normal list */}
      {!loading && !error && !isSearchMode && projects.length > 0 && (
        <div className="space-y-3">
          {visible.length > 0 ? (
            visible.map((project) => (
              <ProjectRow key={project.id} project={project} onUnarchive={handleUnarchive} />
            ))
          ) : (
            <div className="card p-8 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No {statusFilter === "all" ? "" : statusFilter} projects.
              </p>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddExistingCompanyModal projects={projects.filter((p) => p.status === "active")} onClose={() => setShowAdd(false)} onDone={load} />
      )}
    </div>
  );
}

function AddExistingCompanyModal({
  projects,
  onClose,
  onDone,
}: {
  projects: Project[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [companies, setCompanies] = useState<SearchResult["companies"]>([]);
  const [picked, setPicked] = useState<SearchResult["companies"][number] | null>(null);
  const [targetProject, setTargetProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setCompanies([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { companies: [] }))
        .then((d: SearchResult) => setCompanies(d.companies || []))
        .catch(() => setCompanies([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function submit() {
    if (!picked || !targetProject) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/projects/${targetProject}/companies/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: picked.slug }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setMsg(data.alreadyPresent ? "Already in that project — refreshed." : "Added.");
      onDone();
    } else {
      setMsg("Failed to add. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add existing company to a project</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <label className="text-label">1 · Find a company</label>
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          placeholder="Company name…"
          className="input-field w-full mt-1 mb-2"
        />
        {!picked && companies.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
            {companies.map((c) => (
              <button
                key={`${c.projectId}-${c.slug}`}
                onClick={() => { setPicked(c); setCompanies([]); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
              >
                <span className="font-medium text-slate-700 dark:text-slate-300">{c.name}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block">{c.industry || "—"}{c.projectName ? ` · in ${c.projectName}` : ""}</span>
              </button>
            ))}
          </div>
        )}
        {picked && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[rgba(50,137,255,0.08)] mb-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{picked.name}</span>
            <button onClick={() => setPicked(null)} className="text-xs text-slate-400 hover:text-slate-600">change</button>
          </div>
        )}

        <label className="text-label">2 · Add to project</label>
        <select
          value={targetProject}
          onChange={(e) => setTargetProject(e.target.value)}
          className="input-field w-full mt-1 mb-4"
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {msg && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{msg}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Close</button>
          <button onClick={submit} disabled={!picked || !targetProject || busy} className="btn-primary text-sm disabled:opacity-40">
            {busy ? "Adding…" : "Add to project"}
          </button>
        </div>
      </div>
    </div>
  );
}
