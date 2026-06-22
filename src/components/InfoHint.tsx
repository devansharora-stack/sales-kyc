"use client";

import { useState } from "react";

// Small "i" icon with a hover/click popover explaining how something is scored.
export default function InfoHint({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={title}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-[#3289FF] hover:border-[#3289FF]/40 text-[9px] font-bold leading-none cursor-help"
      >
        i
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-6 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 text-left">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{title}</p>
          {lines.map((l, i) => (
            <p key={i} className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mb-1 last:mb-0">
              {l}
            </p>
          ))}
        </div>
      )}
    </span>
  );
}
