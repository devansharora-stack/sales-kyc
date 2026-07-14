"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { CompanyDetail, DeepStakeholderProfile } from "@/lib/types";
import CompanyReadOnly from "./CompanyReadOnly";
import ProjectReadOnly from "./ProjectReadOnly";
import AddToProjectDialog from "./AddToProjectDialog";
import StakeholderProfileView from "@/components/StakeholderProfileView";

interface Resolved {
  resourceType: "project" | "company" | "stakeholder";
  resourceId: string;
  projectId?: string;
  slug?: string;
  name?: string;
}

function ShareBanner() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-xs bg-[rgba(50,137,255,0.08)] text-[#3289FF] border border-[#3289FF]/20 px-2 py-0.5 rounded font-medium">SHARED · READ-ONLY</span>
      <span className="text-xs text-slate-400">You&apos;re viewing a shared research. Editing is disabled.</span>
    </div>
  );
}

export default function SharedPage() {
  const params = useParams();
  const token = params.token as string;

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [stakeholder, setStakeholder] = useState<DeepStakeholderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/shared/${token}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "This link is invalid or has been revoked.");
      }
      const res: Resolved = await r.json();
      setResolved(res);

      if (res.resourceType === "company") {
        const cr = await fetch(`/api/projects/${res.projectId}/companies?slug=${encodeURIComponent(res.slug || "")}&shareToken=${token}`);
        if (!cr.ok) throw new Error("Could not load the shared company.");
        const cd = await cr.json();
        setCompany((cd.profiles?.[0]?.data as CompanyDetail) ?? null);
      } else if (res.resourceType === "stakeholder") {
        const sr = await fetch(`/api/stakeholders/${res.resourceId}?shareToken=${token}`);
        if (!sr.ok) throw new Error("Could not load the shared stakeholder.");
        const sd = await sr.json();
        setStakeholder((sd.stakeholder?.data?.profile as DeepStakeholderProfile) ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="py-20 text-center text-sm text-slate-500">{error}</div>;
  if (!resolved) return <div className="py-20 text-center text-sm text-slate-400">Loading shared research…</div>;

  if (resolved.resourceType === "project") {
    return (
      <>
        <div className="flex items-center justify-between">
          <ShareBanner />
          <AddToProjectDialog token={token} label="this project" />
        </div>
        <ProjectReadOnly projectId={resolved.resourceId} token={token} />
      </>
    );
  }

  if (resolved.resourceType === "company") {
    if (!company) return <div className="py-20 text-center text-sm text-slate-400">Loading shared research…</div>;
    return (
      <>
        <ShareBanner />
        <CompanyReadOnly company={company} actions={<AddToProjectDialog token={token} label="this company" />} />
      </>
    );
  }

  // stakeholder
  if (!stakeholder) return <div className="py-20 text-center text-sm text-slate-400">Loading shared research…</div>;
  return (
    <>
      <div className="flex items-center justify-between">
        <ShareBanner />
        <AddToProjectDialog token={token} label="this stakeholder" />
      </div>
      <StakeholderProfileView p={stakeholder} />
    </>
  );
}
