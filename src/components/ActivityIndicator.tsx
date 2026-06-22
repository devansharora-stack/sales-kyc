"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useActivity, type ActivityItem } from "./ActivityProvider";

function labelFor(item: ActivityItem): string {
  return item.type === "company" ? item.companyName ?? "Company" : item.name ?? "Stakeholder";
}

function statusLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Researching";
    case "resolving":
      return "Resolving";
    case "scraping":
      return "Scraping";
    case "synthesizing":
      return "Synthesizing";
    default:
      return status;
  }
}

export default function ActivityIndicator() {
  const { active, count } = useActivity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Idle: stay subtle/hidden.
  if (count === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#3289FF] bg-[rgba(50,137,255,0.08)] border border-[rgba(50,137,255,0.2)] hover:bg-[rgba(50,137,255,0.12)] transition-all cursor-pointer"
        aria-label={`${count} task${count === 1 ? "" : "s"} running`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#3289FF] opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3289FF]" />
        </span>
        <span>{count}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-2.5 border-b border-[#E2E8F0] dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              In Progress ({count})
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {active.map((item) => {
              const inner = (
                <div className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#3289FF] animate-pulse" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{labelFor(item)}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                      {item.type === "company" ? "Company" : "Stakeholder"} · {statusLabel(item.status)}
                    </div>
                  </div>
                </div>
              );
              return item.projectId ? (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={`/projects/${item.projectId}`}
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  {inner}
                </Link>
              ) : (
                <div key={`${item.type}-${item.id}`}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
