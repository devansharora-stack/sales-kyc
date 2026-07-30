"use client";

export interface Candidate {
  name: string;
  domain: string;
  industry: string;
  hq: string;
  descriptor: string;
}

export default function DisambiguationModal({
  name,
  candidates,
  busy,
  onPick,
  onResearchAsTyped,
  onClose,
}: {
  name: string;
  candidates: Candidate[];
  busy: boolean;
  onPick: (c: Candidate) => void;
  onResearchAsTyped: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div
        className="card w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Multiple companies named &ldquo;{name}&rdquo;
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Pick the one you want — we&apos;ll research that exact company by its website.
          </p>
        </div>

        <div className="overflow-auto divide-y divide-slate-50 dark:divide-slate-800">
          {candidates.map((c) => (
            <button
              key={c.domain}
              disabled={busy}
              onClick={() => onPick(c)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
                <span className="text-xs text-[#3289FF] shrink-0">{c.domain}</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {[c.industry, c.hq].filter(Boolean).join(" · ")}
              </div>
              {c.descriptor && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{c.descriptor}</div>}
            </button>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
          <button onClick={onResearchAsTyped} disabled={busy} className="btn-ghost text-xs disabled:opacity-50">
            None of these — research &ldquo;{name}&rdquo; as typed
          </button>
          <button onClick={onClose} disabled={busy} className="btn-ghost text-xs text-slate-400 disabled:opacity-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
