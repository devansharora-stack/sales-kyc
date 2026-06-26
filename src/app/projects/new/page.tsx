"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

export default function NewProjectPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  // After the project is created, any companies that already have recent
  // research are surfaced here so the user can explicitly choose to reuse it
  // or re-research — instead of silently copying the cached profile.
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [pendingReuse, setPendingReuse] = useState<
    { company_name: string; slug: string; updated_at: string | null; days_old?: number | null; source_project?: string | null }[]
  >([]);
  const [resolvingReuse, setResolvingReuse] = useState<string | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Extract company names from first column (skip header if it looks like one)
      const names: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const val = rows[i]?.[0]?.toString().trim();
        if (!val) continue;
        // Skip common header names
        if (i === 0 && /^(company|name|organization|account)/i.test(val)) continue;
        names.push(val);
      }
      setCompanies((prev) => [...new Set([...prev, ...names])]);
    };
    reader.readAsBinaryString(file);
  }

  function addManualCompanies() {
    if (!manualInput.trim()) return;
    const newNames = manualInput
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setCompanies((prev) => [...new Set([...prev, ...newNames])]);
    setManualInput("");
  }

  function removeCompany(name: string) {
    setCompanies((prev) => prev.filter((c) => c !== name));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    if (creating || createdProjectId) return;
    setError("");
    setCreating(true);

    try {
      // Create project
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to create project. Please try again.");
        setCreating(false);
        return;
      }
      const { project } = data;

      // Add companies if any
      let found: typeof pendingReuse = [];
      if (companies.length > 0) {
        const compRes = await fetch(`/api/projects/${project.id}/companies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companies }),
        });
        const compData = await compRes.json().catch(() => ({}));
        found = (compData?.existing ?? []) as typeof pendingReuse;
      }

      // If some companies already have recent research, let the user decide
      // here before navigating; otherwise go straight to the project.
      if (found.length > 0) {
        setCreatedProjectId(project.id);
        setPendingReuse(found);
        setCreating(false);
        return;
      }

      router.push(`/projects/${project.id}`);
    } catch {
      setError("Failed to create project. Please try again.");
      setCreating(false);
    }
  }

  async function handleReuseDecision(name: string, decision: "reuse" | "refresh") {
    if (!createdProjectId) return;
    setResolvingReuse(name);
    await fetch(`/api/projects/${createdProjectId}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companies: [name],
        ...(decision === "reuse" ? { reuse: true } : { forceRefresh: true }),
      }),
    });
    setResolvingReuse(null);
    setPendingReuse((prev) => prev.filter((p) => p.company_name !== name));
  }

  // Once every reuse decision is resolved, go straight to the project instead
  // of falling back to the (still-populated) creation form.
  useEffect(() => {
    if (createdProjectId && pendingReuse.length === 0) {
      router.push(`/projects/${createdProjectId}`);
    }
  }, [createdProjectId, pendingReuse.length, router]);

  function finishToProject() {
    if (createdProjectId) router.push(`/projects/${createdProjectId}`);
  }

  // Once the project exists, never fall back to the creation form — that path
  // let users re-submit and spawn duplicate projects/jobs. Show the reuse
  // decision step if needed, otherwise a redirecting state.
  if (createdProjectId && pendingReuse.length === 0) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <p className="text-sm text-slate-400 dark:text-slate-500">Setting up your project…</p>
      </div>
    );
  }

  // Existing-research decision step — shown after the project is created when
  // one or more companies already have recent research to reuse.
  if (createdProjectId && pendingReuse.length > 0) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-1">Recent research found</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">
          Some companies have already been researched recently. Choose whether to reuse that research or run it again.
        </p>
        <div className="space-y-2 mb-6">
          {pendingReuse.map((p) => (
            <div key={p.slug} className="card p-4 flex items-center justify-between border-amber-200 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-900/20">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Found recent research for <span className="font-semibold">{p.company_name}</span>
                  {typeof p.days_old === "number" && (
                    <span className="text-slate-500 dark:text-slate-400 font-normal"> ({p.days_old === 0 ? "today" : `${p.days_old} day${p.days_old === 1 ? "" : "s"} old`})</span>
                  )}
                </p>
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
                  Re-research
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={finishToProject} className="btn-primary">
            {pendingReuse.length > 0 ? "Skip & go to project" : "Go to project"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-1">New Project</h1>
      <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">Create a research project and add companies for AI analysis</p>

      {/* Project Details */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Project Details</h2>
        <div className="space-y-4">
          <div>
            <label className="text-label mb-1.5 block">Project Name *</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., Healthcare West Coast Q2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-label mb-1.5 block">Description</label>
            <input
              type="text"
              className="input-field"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Add Companies */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Add Companies</h2>

        {/* File Upload */}
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-ghost w-full py-6 border-dashed"
          >
            <div className="text-center">
              <p className="text-sm">Upload CSV / Excel</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Company names in the first column</p>
            </div>
          </button>
          {fileName && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Uploaded: {fileName}</p>
          )}
        </div>

        {/* Manual Entry */}
        <div className="flex gap-2">
          <textarea
            className="input-field flex-1"
            placeholder="Enter company names or paste URLs (one per line, or comma-separated)"
            rows={2}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addManualCompanies();
              }
            }}
          />
          <button onClick={addManualCompanies} className="btn-primary self-end">
            Add
          </button>
        </div>

        {/* Company List */}
        {companies.length > 0 && (
          <div className="mt-4">
            <p className="text-label mb-2">{companies.length} companies added</p>
            <div className="flex flex-wrap gap-1.5">
              {companies.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[rgba(50,137,255,0.06)] border border-[rgba(50,137,255,0.15)] text-xs text-slate-600 dark:text-slate-300"
                >
                  {c}
                  <button
                    onClick={() => removeCompany(c)}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-500 cursor-pointer"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-900/30 rounded-lg px-4 py-3 mb-6 flex items-center gap-2">
          <span className="text-red-500 dark:text-red-300 text-sm">!</span>
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400 dark:text-red-300 hover:text-red-600 text-xs cursor-pointer">&times;</button>
        </div>
      )}

      {/* Create Button */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Creating..." : `Create Project${companies.length > 0 ? ` (${companies.length} companies)` : ""}`}
        </button>
      </div>
    </div>
  );
}
