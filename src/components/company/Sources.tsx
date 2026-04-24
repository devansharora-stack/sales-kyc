"use client";

import type { Source } from "@/lib/types";

const linkIcon = (
  <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

export default function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {sources.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#3289FF] hover:text-[#3289FF]/80 hover:underline flex items-center gap-0.5"
          title={`${s.label} — ${s.type} — ${s.date}`}
        >
          {linkIcon}
          {s.label}
          <span className="text-slate-400">({s.date?.slice(0, 7)})</span>
        </a>
      ))}
    </div>
  );
}
