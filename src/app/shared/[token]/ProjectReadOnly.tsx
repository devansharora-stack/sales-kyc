"use client";

import { useEffect, useState, useCallback } from "react";
import type { CompanyDetail, Rating } from "@/lib/types";
import RatingBadge from "@/components/company/RatingBadge";
import CompanyReadOnly from "./CompanyReadOnly";

interface ProfileSummary {
  id: string;
  slug: string;
  total_score: number | null;
  rating: Rating | null;
  industry: string | null;
  name?: string;
  hqCity?: string;
  state?: string;
}

export default function ProjectReadOnly({ projectId, token }: { projectId: string; token: string }) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [projectName, setProjectName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CompanyDetail | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pr, cr] = await Promise.all([
          fetch(`/api/projects/${projectId}?shareToken=${token}`),
          fetch(`/api/projects/${projectId}/companies?shareToken=${token}`),
        ]);
        if (cr.ok) setProfiles((await cr.json()).profiles ?? []);
        if (pr.ok) setProjectName((await pr.json()).project?.name ?? "");
      } catch {
        setError("Could not load the shared project.");
      }
    })();
  }, [projectId, token]);

  const openCompany = useCallback(async (slug: string) => {
    setLoadingCompany(true);
    try {
      const cr = await fetch(`/api/projects/${projectId}/companies?slug=${encodeURIComponent(slug)}&shareToken=${token}`);
      if (cr.ok) setSelected(((await cr.json()).profiles?.[0]?.data as CompanyDetail) ?? null);
    } finally {
      setLoadingCompany(false);
    }
  }, [projectId, token]);

  if (error) return <div className="py-20 text-center text-sm text-slate-500">{error}</div>;

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="btn-ghost text-sm mb-3">← Back to project</button>
        <CompanyReadOnly company={selected} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="heading-display text-2xl mb-1">{projectName || "Shared project"}</h1>
      <p className="text-sm text-slate-400 mb-6">{profiles.length} compan{profiles.length === 1 ? "y" : "ies"}</p>

      {loadingCompany && <div className="text-sm text-slate-400 mb-3">Loading company…</div>}

      <div className="grid sm:grid-cols-2 gap-3">
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => openCompany(p.slug)}
            className="card p-4 text-left hover:border-[#3289FF]/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{p.name || p.slug}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{[p.industry, p.hqCity, p.state].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="stat-value text-lg">{p.total_score ?? "–"}</span>
                {p.rating && <RatingBadge rating={p.rating} size="sm" />}
              </div>
            </div>
          </button>
        ))}
        {profiles.length === 0 && <p className="text-sm text-slate-400">No companies in this project yet.</p>}
      </div>
    </div>
  );
}
