"use client";

import { useEffect, useState } from "react";

interface ProjectOption { id: string; name: string; }

export default function AddToProjectDialog({ token, label }: { token: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [choice, setChoice] = useState<string>(""); // project id, or "__new__"
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null); // redirect url

  useEffect(() => {
    if (!open) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        const list: ProjectOption[] = (d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
        setProjects(list);
        setChoice(list[0]?.id ?? "__new__");
      })
      .catch(() => setError("Could not load your projects."));
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = choice === "__new__" ? { newProjectName: newName.trim() } : { targetProjectId: choice };
      if (choice === "__new__" && !newName.trim()) { setError("Enter a project name."); setBusy(false); return; }
      const r = await fetch(`/api/shared/${token}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Copy failed");
      setDone(d.redirectTo || `/projects/${d.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#3289FF] hover:bg-[#2670d8] rounded-lg cursor-pointer">
        Add to my project
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 p-3">
            {done ? (
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">Added {label} to your project.</p>
                <a href={done} className="btn-primary text-xs inline-block">Open it →</a>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">Copy {label} into…</p>
                <div className="max-h-48 overflow-y-auto space-y-1 mb-2">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer px-1 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="radio" name="proj" checked={choice === p.id} onChange={() => setChoice(p.id)} />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer px-1 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input type="radio" name="proj" checked={choice === "__new__"} onChange={() => setChoice("__new__")} />
                    <span>Create new project…</span>
                  </label>
                </div>
                {choice === "__new__" && (
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New project name" className="input-field text-xs w-full mb-2" />
                )}
                {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
                <button onClick={submit} disabled={busy} className="btn-primary text-xs w-full disabled:opacity-50">
                  {busy ? "Copying…" : "Add"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
