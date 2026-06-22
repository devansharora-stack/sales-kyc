"use client";

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";

export interface StakeholderInput {
  name: string;
  company: string;
  title?: string;
  linkedinUrl?: string;
}

interface Props {
  onSubmit: (people: StakeholderInput[], inputType: "manual" | "csv") => Promise<void>;
}

const MAX_ROWS = 100;
const blankRow = (): StakeholderInput => ({ name: "", company: "", title: "", linkedinUrl: "" });

export default function StakeholderImport({ onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [rows, setRows] = useState<StakeholderInput[]>([blankRow()]);
  const [csvRows, setCsvRows] = useState<StakeholderInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback((file: File) => {
    setError(null);
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a .csv file");
      return;
    }
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const people: StakeholderInput[] = [];
        for (const row of result.data as string[][]) {
          const name = (row[0] || "").trim();
          const company = (row[1] || "").trim();
          const title = (row[2] || "").trim();
          if (!name) continue;
          if (name.toLowerCase() === "name" || name.toLowerCase() === "full name") continue;
          if (name.length > 200) continue;
          people.push({ name, company, title });
        }
        if (people.length === 0) {
          setError("No names found. Use columns: Name, Company, Title (optional).");
          return;
        }
        if (people.length > MAX_ROWS) {
          setError(`CSV has ${people.length} rows — only the first ${MAX_ROWS} will be used.`);
        }
        setCsvRows(people.slice(0, MAX_ROWS));
      },
      error: () => setError("Failed to parse CSV — check the file encoding"),
    });
  }, []);

  function updateRow(i: number, field: keyof StakeholderInput, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((_, idx) => idx !== i)));
  }

  function reset() {
    setRows([blankRow()]);
    setCsvRows([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function handleClose() {
    reset();
    setOpen(false);
  }

  async function handleSubmit() {
    const source = mode === "manual" ? rows : csvRows;
    const people = source
      .map((r) => ({ name: r.name.trim(), company: r.company.trim(), title: (r.title || "").trim(), linkedinUrl: (r.linkedinUrl || "").trim() }))
      .filter((r) => r.name.length > 0);
    if (people.length === 0) {
      setError("Add at least one name.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(people, mode);
      reset();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const count = (mode === "manual" ? rows : csvRows).filter((r) => r.name.trim()).length;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost text-sm">
        Import Stakeholders
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Import Stakeholders</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Deep-analyze individuals by name + company, or paste a LinkedIn URL</p>
              </div>
              <button onClick={handleClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 px-5 pt-4">
              {(["manual", "csv"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    mode === m ? "bg-[rgba(50,137,255,0.08)] text-[#3289FF] border border-[rgba(50,137,255,0.2)]" : "text-slate-400 border border-transparent hover:text-[#3289FF]"
                  }`}
                >
                  {m === "manual" ? "Enter manually" : "Upload CSV"}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {mode === "manual" ? (
                <div className="space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(i, "name", e.target.value)}
                        placeholder="Full name *"
                        className="input-field text-sm"
                      />
                      <input
                        value={row.company}
                        onChange={(e) => updateRow(i, "company", e.target.value)}
                        placeholder="Company"
                        className="input-field text-sm"
                      />
                      <input
                        value={row.title}
                        onChange={(e) => updateRow(i, "title", e.target.value)}
                        placeholder="Title (optional)"
                        className="input-field text-sm"
                      />
                      <button
                        onClick={() => removeRow(i)}
                        className="w-7 h-7 flex items-center justify-center rounded text-slate-300 dark:text-slate-500 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-sm"
                        title="Remove row"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button onClick={addRow} className="text-xs text-[#3289FF] hover:underline mt-1">+ Add another</button>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-2">
                    Tip: leave Company blank and paste a full <span className="font-mono">linkedin.com/in/…</span> URL in the Title field if you already have it.
                  </p>
                </div>
              ) : csvRows.length === 0 ? (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
                      dragOver ? "border-[#3289FF] bg-[rgba(50,137,255,0.04)]" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Drop a CSV file here or click to browse</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Columns: Name, Company, Title (optional)</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} className="hidden" />
                </>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 text-left">
                        <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">#</th>
                        <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">Name</th>
                        <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">Company</th>
                        <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">Title</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="p-2 text-xs text-slate-400 dark:text-slate-500">{i + 1}</td>
                          <td className="p-2 text-slate-700 dark:text-slate-300">{r.name}</td>
                          <td className="p-2 text-slate-500 dark:text-slate-400">{r.company || "—"}</td>
                          <td className="p-2 text-slate-500 dark:text-slate-400">{r.title || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
            </div>

            <div className="flex items-center justify-between p-5 border-t border-slate-100 dark:border-slate-700">
              {mode === "csv" && csvRows.length > 0 ? (
                <button onClick={() => { setCsvRows([]); if (fileRef.current) fileRef.current.value = ""; }} className="btn-ghost text-sm">
                  Upload different file
                </button>
              ) : <span />}
              <button onClick={handleSubmit} disabled={submitting || count === 0} className="btn-primary disabled:opacity-50">
                {submitting ? "Queuing…" : `Analyze ${count} ${count === 1 ? "person" : "people"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
