"use client";

import { useState } from "react";

type ResourceType = "project" | "company" | "stakeholder";

export default function ShareButton({ resourceType, resourceId }: { resourceType: ResourceType; resourceId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureLink() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType, resourceId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Could not create link");
      const d = await r.json();
      setUrl(`${window.location.origin}${d.url}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !url) ensureLink();
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke() {
    if (!url) return;
    const token = url.split("/shared/")[1];
    await fetch(`/api/shares/${token}`, { method: "DELETE" });
    setUrl(null);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button onClick={toggle} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#3289FF] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
        Share
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 p-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Share read-only link</p>
            <p className="text-[11px] text-slate-400 mb-2">Anyone at Techolution with this link can view (sign-in required). Editing stays with you.</p>
            {loading && <p className="text-xs text-slate-400">Generating link…</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
            {url && (
              <>
                <div className="flex items-center gap-1">
                  <input readOnly value={url} className="input-field text-xs flex-1" onFocus={(e) => e.target.select()} />
                  <button onClick={copy} className="btn-primary text-xs px-2 py-1.5 shrink-0">{copied ? "Copied" : "Copy"}</button>
                </div>
                <button onClick={revoke} className="text-[11px] text-red-500 hover:underline mt-2">Revoke link</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
