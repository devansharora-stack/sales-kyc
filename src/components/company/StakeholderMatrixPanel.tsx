"use client";

import { useState } from "react";
import type { StakeholderOfferingMatrix, CellStrength } from "@/lib/types";
import { normalizeStakeholderName } from "@/lib/names";

const strengthStyles: Record<CellStrength, { cell: string; badge: string }> = {
  strong: {
    cell: "bg-[rgba(50,137,255,0.06)] border-[#3289FF]/30",
    badge: "bg-[#3289FF] text-white",
  },
  conditional: {
    cell: "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
    badge: "bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300",
  },
  none: {
    cell: "bg-slate-50/40 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700",
    badge: "",
  },
};

const ACTIVE_DEEP = ["queued", "resolving", "scraping", "synthesizing"];

interface DeepRow {
  id: string;
  status: string;
}

interface MatrixPanelProps {
  matrix: StakeholderOfferingMatrix;
  projectId: string;
  deepByName: Map<string, DeepRow>;
  onDeepResearch: (name: string, title: string) => Promise<void> | void;
  /** Open the existing deep profile in a slide-over (keeps company context). */
  onOpenDeep: (id: string, name: string, title: string) => void;
  /** Read-only (shared view): hide deep-research / open-profile actions. */
  readOnly?: boolean;
}

function deepLabel(status: string): string {
  if (status === "completed") return "Analyzed ✓ ▸";
  if (ACTIVE_DEEP.includes(status)) return "Analyzing…";
  if (status === "needs_confirmation") return "Needs URL";
  if (status === "departed") return "Departed";
  if (status === "failed") return "Failed";
  return "View ▸";
}

export default function StakeholderMatrixPanel({ matrix, deepByName, onDeepResearch, onOpenDeep, readOnly = false }: MatrixPanelProps) {
  const [busy, setBusy] = useState<Set<string>>(new Set());

  async function handleResearch(name: string, title: string) {
    setBusy((prev) => new Set(prev).add(name));
    try {
      await onDeepResearch(name, title);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }

  if (!matrix?.rows?.length || !matrix?.solutionColumns?.length) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">
        No stakeholder matrix available. Re-run research on this company to generate it.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#3289FF]" /> Strong
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-300" /> Conditional
        </span>
        <span className="text-slate-400 dark:text-slate-500">Each cell: who sponsors/approves the offering and how to approach them.</span>
      </div>

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <th className="text-left text-label px-4 py-2.5 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 min-w-[180px]">
                Stakeholder
              </th>
              {matrix.solutionColumns.map((col) => (
                <th
                  key={col.id}
                  className="text-left text-label px-3 py-2.5 min-w-[160px] border-l border-slate-200 dark:border-slate-700"
                  title={col.name}
                >
                  {col.shortName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-slate-100 dark:border-slate-700 last:border-0 align-top">
                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-700">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{row.stakeholderName}</p>
                  {row.title && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.title}</p>}
                  {row.powerLabel && (
                    <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      {row.powerLabel}
                    </span>
                  )}
                  {!readOnly && <div className="mt-1.5">
                    {(() => {
                      const deep = deepByName.get(normalizeStakeholderName(row.stakeholderName));
                      if (deep) {
                        const isDone = deep.status === "completed";
                        const chipClass = isDone
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                          : "bg-[rgba(50,137,255,0.08)] text-[#3289FF] border-[#3289FF]/20 hover:underline";
                        return (
                          <button
                            onClick={() => onOpenDeep(deep.id, row.stakeholderName, row.title)}
                            title={isDone ? "Open deep profile (already analyzed)" : undefined}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer ${chipClass}`}
                          >
                            {deepLabel(deep.status)}
                          </button>
                        );
                      }
                      return (
                        <button
                          onClick={() => handleResearch(row.stakeholderName, row.title)}
                          disabled={busy.has(row.stakeholderName)}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-[#3289FF] hover:border-[#3289FF]/30 disabled:opacity-50 cursor-pointer"
                        >
                          {busy.has(row.stakeholderName) ? "Queuing…" : "Deep research"}
                        </button>
                      );
                    })()}
                  </div>}
                  {row.enriched && (
                    <span className="block mt-1 text-[10px] font-medium text-[#3289FF]" title="This row was built using verified deep-research intel">
                      ✦ deep-informed
                    </span>
                  )}
                </td>
                {row.cells.map((cell, ci) => {
                  const styles = strengthStyles[cell.strength] || strengthStyles.none;
                  return (
                    <td key={ci} className={`px-3 py-3 border-l align-top ${styles.cell}`}>
                      {cell.role ? (
                        <>
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${styles.badge}`}>
                            {cell.role}
                          </span>
                          {cell.rationale && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-snug">{cell.rationale}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-500 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
