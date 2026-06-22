"use client";

import { useState } from "react";

const chevron = (
  <svg className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export default function CollapsibleItem({
  header,
  children,
  defaultOpen = false,
  className = "",
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          {chevron}
        </div>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
