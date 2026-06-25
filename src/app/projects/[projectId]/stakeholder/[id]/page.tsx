"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { DeepStakeholderProfile, StakeholderScriptSet, StakeholderStatus } from "@/lib/types";
import StakeholderProfileView from "@/components/StakeholderProfileView";
import { generateStakeholderPDF } from "@/lib/generate-pdf";

interface StakeholderResponse {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  status: StakeholderStatus;
  progress: number;
  linkedin_url: string | null;
  url_confidence: string | null;
  error_message: string | null;
  data: { profile?: DeepStakeholderProfile; scripts?: StakeholderScriptSet } | null;
}

const ACTIVE: StakeholderStatus[] = ["queued", "resolving", "scraping", "synthesizing"];

const STATUS_LABEL: Record<StakeholderStatus, string> = {
  queued: "Queued",
  resolving: "Resolving LinkedIn URL",
  needs_confirmation: "Needs LinkedIn URL",
  scraping: "Scraping profile",
  synthesizing: "Synthesizing intelligence",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  departed: "No longer at company",
};

export default function StakeholderDetailPage() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const router = useRouter();
  const [s, setS] = useState<StakeholderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/stakeholders/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setS(data.stakeholder);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isActive = s ? ACTIVE.includes(s.status) : false;
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [isActive, fetchData]);

  async function handleConfirm() {
    setConfirmError(null);
    setConfirming(true);
    const res = await fetch(`/api/stakeholders/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedinUrl: urlInput.trim() }),
    });
    setConfirming(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setConfirmError(data.error || "Failed to submit URL.");
      return;
    }
    setUrlInput("");
    fetchData();
  }

  async function handleNoLinkedin() {
    setConfirmError(null);
    setSkipping(true);
    const res = await fetch(`/api/stakeholders/${id}/no-linkedin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setSkipping(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setConfirmError(data.error || "Failed to update stakeholder.");
      return;
    }
    fetchData();
  }

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4 py-8 max-w-6xl mx-auto">
        <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="card p-6"><div className="h-20 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" /></div>
      </div>
    );
  }

  if (error || !s) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Stakeholder not found or failed to load.</p>
        <button onClick={() => router.push(`/projects/${projectId}/stakeholders`)} className="btn-ghost text-sm">
          Back to Stakeholders
        </button>
      </div>
    );
  }

  const profile = s.data?.profile;

  return (
    <div className="animate-fade-in">
      <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <button
          onClick={() => router.push(`/projects/${projectId}/stakeholders`)}
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF] mb-1 cursor-pointer"
        >
          &larr; Stakeholders
        </button>
        {profile && (
          <button
            onClick={() => generateStakeholderPDF(profile)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#3289FF] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#3289FF]/30 rounded-lg transition-colors cursor-pointer"
            title="Download PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </button>
        )}
      </div>

      {/* Active / pending / failed states */}
      {!profile && (
        <div className="max-w-6xl mx-auto">
          <div className="card p-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{s.name}</h1>
              <span className="text-xs text-slate-400 dark:text-slate-500">{STATUS_LABEL[s.status]}</span>
            </div>
            {s.company && <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">{s.title ? `${s.title} · ` : ""}{s.company}</p>}

            {isActive && (
              <>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-[#3289FF] rounded-full transition-all duration-500" style={{ width: `${s.progress || 5}%` }} />
                </div>
                <p className="text-xs text-[#3289FF] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3289FF] inline-block animate-pulse-dot" />
                  {STATUS_LABEL[s.status]}…
                </p>
              </>
            )}

            {s.status === "needs_confirmation" && (
              <div className="mt-4">
                <p className="text-sm text-amber-600 dark:text-amber-300 mb-3">
                  We couldn&apos;t confidently identify this person&apos;s LinkedIn profile. Paste the correct profile URL to continue.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field flex-1 text-sm"
                    placeholder="https://www.linkedin.com/in/…"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                  />
                  <button onClick={handleConfirm} disabled={confirming || skipping || !urlInput.trim()} className="btn-primary disabled:opacity-50">
                    {confirming ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
                <button
                  onClick={handleNoLinkedin}
                  disabled={confirming || skipping}
                  className="btn-ghost text-xs mt-3 disabled:opacity-50"
                >
                  {skipping ? "Saving…" : "They don't have a LinkedIn profile"}
                </button>
                {confirmError && <p className="text-xs text-red-500 mt-2">{confirmError}</p>}
              </div>
            )}

            {s.status === "failed" && (
              <div className="mt-2">
                <p className="text-sm text-red-500">{s.error_message || "Analysis failed."}</p>
              </div>
            )}

            {s.status === "departed" && (
              <div className="mt-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {s.error_message || "This person no longer holds this role at the company, so they were excluded from current stakeholders."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {profile && <StakeholderProfileView p={profile} />}
    </div>
  );
}
