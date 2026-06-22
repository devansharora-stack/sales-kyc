"use client";

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";

interface CSVUploadProps {
  existingSlugs: string[];
  onSubmit: (companies: string[]) => Promise<void>;
}

interface ParsedRow {
  name: string;
  selected: boolean;
  isDuplicate: boolean;
}

const MAX_ROWS = 100;

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function CSVUpload({ existingSlugs, onSubmit }: CSVUploadProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const slugSet = new Set(existingSlugs.map((s) => s.toLowerCase()));

  const parseFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.name.endsWith(".csv")) {
        setError("Please upload a .csv file");
        return;
      }

      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (result) => {
          const names: string[] = [];

          for (const row of result.data as string[][]) {
            const cell = (row[0] || "").trim();
            if (!cell) continue;
            // Skip likely header rows
            if (
              cell.toLowerCase() === "company" ||
              cell.toLowerCase() === "company name" ||
              cell.toLowerCase() === "name" ||
              cell.toLowerCase() === "account"
            )
              continue;
            if (cell.length > 500) continue;
            names.push(cell);
          }

          if (names.length === 0) {
            setError("No company names found in the CSV");
            return;
          }

          // Deduplicate within the CSV itself
          const seen = new Set<string>();
          const unique = names.filter((n) => {
            const key = normalize(n);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          if (unique.length > MAX_ROWS) {
            setError(`CSV has ${unique.length} companies — max is ${MAX_ROWS}. Only the first ${MAX_ROWS} will be shown.`);
          }

          const parsed: ParsedRow[] = unique.slice(0, MAX_ROWS).map((name) => ({
            name,
            selected: !slugSet.has(normalize(name)),
            isDuplicate: slugSet.has(normalize(name)),
          }));

          setRows(parsed);
        },
        error: () => {
          setError("Failed to parse CSV — check the file encoding");
        },
      });
    },
    [slugSet]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function toggleRow(index: number) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  }

  function toggleAll() {
    const allSelected = rows.every((r) => r.selected);
    setRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  }

  async function handleSubmit() {
    const selected = rows.filter((r) => r.selected).map((r) => r.name);
    if (selected.length === 0) return;

    setSubmitting(true);
    await onSubmit(selected);
    setSubmitting(false);
    setRows([]);
    setOpen(false);
  }

  function handleClose() {
    setRows([]);
    setError(null);
    setOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const dupeCount = rows.filter((r) => r.isDuplicate).length;

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost text-sm">
        Upload CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Upload CSV</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">One company name per row, up to {MAX_ROWS} companies</p>
              </div>
              <button onClick={handleClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {rows.length === 0 ? (
                <>
                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
                      dragOver ? "border-[#3289FF] bg-[rgba(50,137,255,0.04)]" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                    onClick={() => fileRef.current?.click()}
                  >
                    <svg className="w-10 h-10 text-slate-300 dark:text-slate-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Drop a CSV file here or click to browse</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">CSV with company names in the first column</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </>
              ) : (
                <>
                  {/* Preview table */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{selectedCount}</span> of {rows.length} selected
                      {dupeCount > 0 && (
                        <span className="text-slate-400 dark:text-slate-500 ml-2">({dupeCount} already researched)</span>
                      )}
                    </div>
                    <button onClick={toggleAll} className="text-xs text-[#3289FF] hover:underline">
                      {rows.every((r) => r.selected) ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 text-left">
                          <th className="p-2 w-10"></th>
                          <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">#</th>
                          <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">Company Name</th>
                          <th className="p-2 text-xs font-medium text-slate-500 dark:text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr
                            key={i}
                            className={`border-t border-slate-100 dark:border-slate-700 ${!row.selected ? "opacity-50" : ""}`}
                          >
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => toggleRow(i)}
                                className="rounded border-slate-300 dark:border-slate-600 text-[#3289FF] focus:ring-[#3289FF]"
                              />
                            </td>
                            <td className="p-2 text-xs text-slate-400 dark:text-slate-500">{i + 1}</td>
                            <td className="p-2 text-slate-700 dark:text-slate-300">{row.name}</td>
                            <td className="p-2">
                              {row.isDuplicate ? (
                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded-full border border-amber-200 dark:border-amber-800">
                                  Already researched
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                                  New
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {error && (
                <p className="text-xs text-red-500 dark:text-red-300 mt-3">{error}</p>
              )}
            </div>

            {/* Footer */}
            {rows.length > 0 && (
              <div className="flex items-center justify-between p-5 border-t border-slate-100 dark:border-slate-700">
                <button onClick={() => { setRows([]); setError(null); if (fileRef.current) fileRef.current.value = ""; }} className="btn-ghost text-sm">
                  Upload different file
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || selectedCount === 0}
                  className="btn-primary disabled:opacity-50"
                >
                  {submitting ? "Queuing research..." : `Research ${selectedCount} ${selectedCount === 1 ? "company" : "companies"}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
