"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { DeepStakeholderProfile, StakeholderStatus, IntelQuality } from "@/lib/types";

interface StakeholderResponse {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  status: StakeholderStatus;
  progress: number;
  error_message: string | null;
  data: { profile?: DeepStakeholderProfile } | null;
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

const qualityStyles: Record<IntelQuality, string> = {
  HIGH: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-blue-50 text-blue-700 border-blue-200",
  LOW: "bg-amber-50 text-amber-700 border-amber-200",
};

interface DrawerProps {
  /** Stakeholder id, or null when closed. */
  stakeholderId: string | null;
  projectId: string;
  /** Fallback display info shown before/while data loads or if no deep data. */
  fallback?: { name?: string; title?: string | null; company?: string | null };
  onClose: () => void;
}

export default function StakeholderDrawer({ stakeholderId, projectId, fallback, onClose }: DrawerProps) {
  const [s, setS] = useState<StakeholderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(false);

  const fetchData = useCallback(async () => {
    if (!stakeholderId) return;
    try {
      const res = await fetch(`/api/stakeholders/${stakeholderId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setS(data.stakeholder);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [stakeholderId]);

  // (Re)load when the target id changes.
  useEffect(() => {
    if (!stakeholderId) return;
    setS(null);
    setLoading(true);
    setError(false);
    fetchData();
  }, [stakeholderId, fetchData]);

  // Poll while the analysis is still in flight.
  const isActive = s ? ACTIVE.includes(s.status) : false;
  useEffect(() => {
    if (!stakeholderId || !isActive) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [stakeholderId, isActive, fetchData]);

  // Esc to close.
  useEffect(() => {
    if (!stakeholderId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stakeholderId, onClose]);

  // Trigger the slide-in transition after mount.
  useEffect(() => {
    if (!stakeholderId) { setShown(false); return; }
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, [stakeholderId]);

  if (!stakeholderId) return null;

  const profile = s?.data?.profile;
  const brief = profile?.intelBrief;
  const richness = profile?.dataRichness;

  const displayName = profile?.fullName || s?.name || fallback?.name || "Stakeholder";
  const displayTitle = profile?.headline || s?.title || fallback?.title || null;
  const displayCompany = profile?.companyIntel?.companyName || s?.company || fallback?.company || null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] animate-fade-in"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className={`absolute right-0 top-0 h-full w-[480px] max-w-[90vw] bg-white shadow-2xl border-l border-slate-200 flex flex-col transition-transform duration-200 ease-out ${shown ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-800 truncate">{displayName}</h2>
            {displayTitle && <p className="text-sm text-slate-500 truncate">{displayTitle}</p>}
            {displayCompany && <p className="text-xs text-slate-400 truncate mt-0.5">{displayCompany}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="space-y-3">
              <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-20 w-full bg-slate-50 rounded animate-pulse" />
              <div className="h-16 w-full bg-slate-50 rounded animate-pulse" />
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-slate-500">Failed to load this profile.</p>
          )}

          {!loading && !error && s && (
            <>
              {/* Status / coverage */}
              <div className="flex flex-wrap items-center gap-2">
                {s.status !== "completed" && (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                    s.status === "failed" || s.status === "cancelled" || s.status === "departed"
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-[rgba(50,137,255,0.08)] text-[#3289FF] border-[#3289FF]/20"
                  }`}>
                    {STATUS_LABEL[s.status] || s.status}
                    {ACTIVE.includes(s.status) ? "…" : ""}
                  </span>
                )}
                {brief && (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${qualityStyles[brief.intelQuality]}`}>
                    Intel coverage: {brief.intelQuality}
                  </span>
                )}
                {richness && (
                  <span className="text-[11px] text-slate-400">{richness.score}% data richness</span>
                )}
              </div>

              {ACTIVE.includes(s.status) && !brief && (
                <p className="text-sm text-slate-500">
                  Deep research is in progress. This view will fill in automatically when it completes.
                </p>
              )}

              {s.status === "needs_confirmation" && (
                <p className="text-sm text-slate-500">
                  We could not confirm a LinkedIn URL automatically. Open the full page to provide one.
                </p>
              )}

              {brief && (
                <>
                  {/* Executive summary */}
                  {brief.executiveSummary && (
                    <Section title="Executive summary">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{brief.executiveSummary}</p>
                    </Section>
                  )}

                  {brief.keyInsight && (
                    <div className="bg-[rgba(50,137,255,0.04)] border border-[#3289FF]/15 rounded-lg px-4 py-3">
                      <p className="text-label text-[#3289FF] mb-1">Key insight</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{brief.keyInsight}</p>
                    </div>
                  )}

                  {/* Verified priorities */}
                  {brief.verifiedPriorities?.length > 0 && (
                    <Section title="Verified priorities">
                      <ul className="space-y-2">
                        {brief.verifiedPriorities.map((p, i) => (
                          <li key={i} className="border-l-2 border-emerald-300 pl-3">
                            <p className="text-sm font-medium text-slate-800">{p.priority}</p>
                            {p.evidence && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{p.evidence}</p>}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Pain points */}
                  {brief.painPoints?.length > 0 && (
                    <Section title="Pain points">
                      <ul className="space-y-2">
                        {brief.painPoints.map((p, i) => (
                          <li key={i} className="border-l-2 border-orange-300 pl-3">
                            <p className="text-sm font-medium text-slate-800">{p.pain}</p>
                            {p.evidence && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{p.evidence}</p>}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {/* Engagement approach */}
                  {brief.engagementApproach && (
                    <Section title="Engagement approach">
                      {brief.engagementApproach.openingAngle && (
                        <p className="text-sm text-slate-700 leading-relaxed mb-2">
                          <span className="font-medium">Opening angle: </span>
                          {brief.engagementApproach.openingAngle}
                        </p>
                      )}
                      {brief.engagementApproach.talkingPoints?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-label mb-1">Talking points</p>
                          <ul className="space-y-1">
                            {brief.engagementApproach.talkingPoints.map((t, i) => (
                              <li key={i} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
                                <span className="text-[#3289FF] shrink-0">•</span>
                                <span>{t}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {brief.engagementApproach.avoidTopics?.length > 0 && (
                        <div>
                          <p className="text-label text-red-500 mb-1">Avoid</p>
                          <ul className="space-y-1">
                            {brief.engagementApproach.avoidTopics.map((t, i) => (
                              <li key={i} className="flex gap-2 text-sm text-slate-500 leading-relaxed">
                                <span className="text-red-400 shrink-0">×</span>
                                <span>{t}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Section>
                  )}
                </>
              )}

              {/* No deep data — basic card already covered by header; nothing more to show. */}
              {!brief && !ACTIVE.includes(s.status) && s.status !== "needs_confirmation" && (
                <p className="text-sm text-slate-400">No deep intelligence available for this contact yet.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 shrink-0">
          <Link
            href={`/projects/${projectId}/stakeholder/${stakeholderId}`}
            className="text-xs font-medium text-[#3289FF] hover:underline inline-flex items-center gap-1"
          >
            Open full page ↗
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-label mb-1.5">{title}</p>
      {children}
    </div>
  );
}
