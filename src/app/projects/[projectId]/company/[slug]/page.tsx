"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CompanyDetail, Source, SolutionId, SolutionMapping, EstimatedImpact, SalesMotionType } from "@/lib/types";
import { ALL_SOLUTIONS } from "@/lib/types";
import { generateCompanyPDF, generateCompanyOnePager } from "@/lib/generate-pdf";
import { normalizeStakeholderName } from "@/lib/names";
import RatingBadge from "@/components/company/RatingBadge";
import GeminiStatusBadge from "@/components/company/GeminiStatusBadge";
import UrgencyBadge from "@/components/company/UrgencyBadge";
import ScoreBar from "@/components/company/ScoreBar";
import Sources from "@/components/company/Sources";
import TechLandscapePanel from "@/components/company/TechLandscapePanel";
import PartnerLandscapePanel from "@/components/company/PartnerLandscapePanel";
import StakeholderMatrixPanel from "@/components/company/StakeholderMatrixPanel";
import NumberedList from "@/components/company/NumberedList";
import CollapsibleItem from "@/components/company/CollapsibleItem";
import StakeholderDrawer from "@/components/stakeholder/StakeholderDrawer";
import InfoHint from "@/components/InfoHint";

const solName = (id: SolutionId | string) =>
  ALL_SOLUTIONS.find(s => s.id === id)?.name ?? id;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "intelligence", label: "Intelligence" },
  { id: "gtm", label: "GTM Strategy" },
  { id: "solutions", label: "Solution Mapping" },
  { id: "partners", label: "Partner Landscape" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "matrix", label: "Stakeholder Matrix" },
  { id: "sources", label: "Sources" },
];

const categoryBadgeColors: Record<string, string> = {
  "M&A": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Leadership: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "Earnings Pressure": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Regulatory: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Legacy Systems": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Competitor Pressure": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "Digital Transformation": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Workforce: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
};

const severityBadgeColors: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const tierColors = {
  "Decision Maker": { bg: "bg-[rgba(50,137,255,0.04)]", border: "border-[#3289FF]/20", badge: "bg-[rgba(50,137,255,0.08)] text-[#3289FF]" },
  "Champion": { bg: "bg-emerald-50/50 dark:bg-slate-800/60", border: "border-emerald-200/60 dark:border-slate-700", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  "Influencer": { bg: "bg-amber-50/50 dark:bg-slate-800/60", border: "border-amber-200/60 dark:border-slate-700", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
} as const;

interface DeepStakeholderRow {
  id: string;
  name: string;
  status: string;
  title?: string | null;
  company?: string | null;
  company_profile_id?: string | null;
  linkedin_url?: string | null;
}

function PdfMenu({ company }: { company: CompanyDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#3289FF] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#3289FF]/30 rounded-lg transition-colors cursor-pointer"
        title="Download PDF"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        PDF
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
            <button onClick={() => { generateCompanyPDF(company); setOpen(false); }} className="block w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
              Full report
            </button>
            <button onClick={() => { generateCompanyOnePager(company); setOpen(false); }} className="block w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-700 cursor-pointer">
              One-pager
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function CompanyPage() {
  const params = useParams();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [companyProfileId, setCompanyProfileId] = useState<string | null>(null);
  const [deepRows, setDeepRows] = useState<DeepStakeholderRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingReuse, setPendingReuse] = useState<{ name: string; company: string | null; title: string | null; updated_at: string | null }[]>([]);
  const [resolvingReuse, setResolvingReuse] = useState<string | null>(null);
  // Slide-over drawer: holds the deep-stakeholder id to view (null = closed).
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerFallback, setDrawerFallback] = useState<{ name?: string; title?: string | null; company?: string | null }>({});
  // Inline "add stakeholder the research missed" form (scoped to this company).
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addCompany, setAddCompany] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const projectId = params.projectId as string;
  const slug = params.slug as string;

  const fetchDeep = (pid: string) => {
    fetch(`/api/projects/${pid}/stakeholders`)
      .then(r => r.ok ? r.json() : { stakeholders: [] })
      .then(d => setDeepRows(d.stakeholders || []))
      .catch(() => {});
  };

  const fetchCompany = useCallback(() => {
    if (!projectId || !slug) return;
    fetch(`/api/projects/${projectId}/companies?slug=${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        // API returns { profiles, jobs } — find the matching profile
        const profile = data.profiles?.find((p: { slug: string }) => p.slug === slug);
        if (!profile) throw new Error("Not found");
        setCompanyProfileId(profile.id || null);
        // Profile data is stored in the `data` JSONB column
        setCompany(profile.data || profile);
      })
      .catch(() => setError(true));
  }, [projectId, slug]);

  useEffect(() => {
    if (!projectId || !slug) return;
    fetchCompany();
    fetchDeep(projectId);
  }, [projectId, slug, fetchCompany]);

  const deepByName = new Map(deepRows.map(d => [normalizeStakeholderName(d.name), d]));

  const hasActiveDeep = deepRows.some(d => ["queued", "resolving", "scraping", "synthesizing"].includes(d.status));
  useEffect(() => {
    if (!hasActiveDeep || !projectId) return;
    const interval = setInterval(() => fetchDeep(projectId), 3000);
    return () => clearInterval(interval);
  }, [hasActiveDeep, projectId]);

  // When a deep research run newly completes, the backend rebuilds this
  // company's matrix — re-fetch the profile so the enriched matrix shows.
  const completedDeepRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const done = deepRows.filter(d => d.status === "completed").map(d => d.id);
    const isNew = done.some(id => !completedDeepRef.current.has(id));
    completedDeepRef.current = new Set(done);
    if (isNew) fetchCompany();
  }, [deepRows, fetchCompany]);


  function toggleSelect(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function postPeople(
    people: { name: string; company: string | null; title: string | null; linkedinUrl?: string | null }[],
    opts?: { reuse?: boolean; forceRefresh?: boolean },
  ) {
    const res = await fetch(`/api/projects/${projectId}/stakeholders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stakeholders: people, inputType: "company", companyProfileId, ...opts }),
    });
    const data = await res.json().catch(() => ({}));
    const found = (data?.existing ?? []) as { name: string; company: string | null; updated_at: string | null }[];
    if (found.length > 0) {
      setPendingReuse(prev => {
        const seen = new Set(prev.map(p => p.name.toLowerCase()));
        const add = found
          .filter(f => !seen.has(f.name.toLowerCase()))
          .map(f => ({ name: f.name, company: f.company, title: people.find(p => p.name === f.name)?.title ?? null, updated_at: f.updated_at }));
        return [...prev, ...add];
      });
    }
  }

  async function handleDeepAnalyze() {
    if (!company || selected.size === 0) return;
    const people = company.stakeholders
      .filter(s => selected.has(s.name))
      .map(s => ({ name: s.name, company: company.name, title: s.title }));
    setAnalyzing(true);
    await postPeople(people);
    setAnalyzing(false);
    setSelected(new Set());
    fetchDeep(projectId);
  }

  // Re-analyze a single stakeholder that already has a completed deep profile —
  // force a fresh run (de-emphasized secondary action on the Stakeholders tab).
  async function handleReanalyze(name: string, title: string) {
    if (!company) return;
    await postPeople([{ name, company: company.name, title: title || null }], { forceRefresh: true });
    fetchDeep(projectId);
  }

  // Matrix per-stakeholder trigger: reuse a fresh saved profile if one exists,
  // otherwise queue a fresh analysis — no prompt (silent reuse).
  async function handleMatrixDeepResearch(name: string, title: string) {
    if (!company) return;
    await postPeople([{ name, company: company.name, title: title || null }], { reuse: true });
    fetchDeep(projectId);
  }

  // Add a stakeholder the research missed, scoped to THIS company, and run a
  // deep analysis on them immediately (reuse a fresh saved profile if one exists).
  async function handleManualAdd() {
    const name = addName.trim();
    if (!name || !company) return;
    setAddBusy(true);
    await postPeople(
      [{
        name,
        company: addCompany.trim() || company.name,
        title: addTitle.trim() || null,
        linkedinUrl: addUrl.trim() || null,
      }],
      { reuse: true },
    );
    setAddBusy(false);
    setAddName(""); setAddTitle(""); setAddCompany(""); setAddUrl("");
    setAddOpen(false);
    fetchDeep(projectId);
  }

  async function handleReuseDecision(person: { name: string; company: string | null; title: string | null }, decision: "reuse" | "refresh") {
    setResolvingReuse(person.name);
    await postPeople([person], decision === "reuse" ? { reuse: true } : { forceRefresh: true });
    setPendingReuse(prev => prev.filter(p => p.name !== person.name));
    setResolvingReuse(null);
    fetchDeep(projectId);
  }

  // Single, low-friction custom add: name (required) + optional title + LinkedIn.
  // Open the slide-over for a deep-stakeholder id (keeps company context).
  function openDrawer(id: string, fallback?: { name?: string; title?: string | null; company?: string | null }) {
    setDrawerFallback(fallback ?? {});
    setDrawerId(id);
  }

  if (error) return (
    <div className="text-center py-20">
      <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
        <span className="text-red-400 dark:text-red-500 text-xl">!</span>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Company not found.</p>
      <Link href={`/projects/${projectId}`} className="btn-ghost text-sm">Back to Project</Link>
    </div>
  );

  if (!company) return (
    <div className="animate-fade-in space-y-6">
      <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-8 w-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-4 w-48 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" />
            </div>
            <div className="space-y-2 items-end flex flex-col">
              <div className="h-8 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              <div className="flex gap-2">
                <div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-700">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-5 py-3">
              <div className="h-3 w-14 bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse mb-1" />
              <div className="h-4 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="card p-6 space-y-3">
        <div className="h-5 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-20 w-full bg-slate-50 dark:bg-slate-800/60 rounded animate-pulse" />
      </div>
    </div>
  );

  /* Deduplicated source bibliography */
  const allSources: Source[] = [];
  const seen = new Set<string>();
  const add = (s?: Source[]) => {
    s?.forEach(src => { if (!seen.has(src.url)) { seen.add(src.url); allSources.push(src); } });
  };
  add(company.sources);
  company.triggerEvents?.forEach(t => add(t.sources));
  company.painPoints?.forEach(p => add(p.sources));
  company.solutionMappings?.forEach(m => {
    add(m.sources);
    if (m.estimatedImpact && typeof m.estimatedImpact === "object") add(m.estimatedImpact.sources);
  });
  add(company.gtm?.sources);
  add(company.gtm?.briefSources);
  add(company.gtm?.entrySolutionSources);
  add(company.gtm?.urgencySources);
  add(company.gtm?.competitiveSources);
  add(company.revenue?.sources);
  add(company.employees?.sources);
  if (company.scores) {
    Object.values(company.scores).forEach((dim: any) => add(dim?.sources));
  }
  const tl = company.techLandscape;
  if (tl) {
    add(tl.cloudProviders?.sources);
    add(tl.workspacePlatform?.sources);
    add(tl.knownAIDeployments?.sources);
    add(tl.knownVendors?.sources);
    add(tl.knownSystems?.sources);
  }

  // Deep-analyzed people for THIS company who aren't in the AI-found list —
  // i.e. the ones added manually. Shown as their own cards in the list.
  const researchNames = new Set((company.stakeholders || []).map(s => normalizeStakeholderName(s.name)));
  const manualRows = deepRows.filter(
    d => d.company_profile_id === companyProfileId && !researchNames.has(normalizeStakeholderName(d.name)),
  );

  return (
    <div className="animate-fade-in">
      <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 dark:text-slate-400 hover:text-[#3289FF] mb-4 inline-flex items-center gap-1 transition-colors">&larr; Back to Project</Link>

      {/* Company Hero Card — scrolls away normally. Nothing here changes height on
          scroll, so the page never jumps (this was the source of the scroll jank). */}
      <div className="card p-0 mb-3 overflow-hidden">
        <div className="bg-gradient-to-r from-[#F8FAFF] to-white dark:from-slate-800/60 dark:to-slate-900 px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="heading-display text-3xl mb-1">{company.name}</h1>
              {company.fullName !== company.name && <p className="text-sm text-slate-500 dark:text-slate-400">{company.fullName}</p>}
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{company.industry} &middot; {company.subSector} &middot; {company.hqCity}, {company.state}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-baseline gap-1.5">
                <span className="stat-value text-3xl">{company.totalScore}</span>
                <span className="text-slate-400 dark:text-slate-500 text-sm">/100</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RatingBadge rating={company.rating} showLabel size="md" />
                <GeminiStatusBadge status={company.geminiStatus} />
                <UrgencyBadge urgency={company.gtm?.urgency || "Medium"} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-slate-100 dark:divide-slate-700">
          <div className="px-5 py-3">
            <p className="text-label">Revenue</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.revenue?.value || "N/A"}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-label">Employees</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.employees?.value || "N/A"}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-label">Triggers</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.triggerEvents?.length || 0} events</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-label">Stakeholders</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.stakeholders?.length || 0} contacts</p>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          <ScoreBar scores={company.scores} total={company.totalScore} />
        </div>
      </div>

      {/* Sticky bar: compact identity + tabs at a CONSTANT height. Because it never
          swaps elements or changes size, scrolling never shifts layout — no jank.
          top-0 because the scroll container already starts below the fixed 56px nav. */}
      <div className="sticky top-0 z-30 bg-[#F8FAFC] dark:bg-slate-900 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-2">
        <div className="bg-white/95 dark:bg-slate-900 backdrop-blur-sm border-b border-[#E2E8F0] dark:border-slate-700">
          <div className="flex items-center gap-3 px-1 pt-1 pb-2">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{company.name}</h2>
            <span className="flex items-baseline gap-0.5 shrink-0">
              <span className="stat-value text-lg">{company.totalScore}</span>
              <span className="text-slate-400 dark:text-slate-500 text-xs">/100</span>
            </span>
            <RatingBadge rating={company.rating} size="md" />
            <div className="ml-auto">
              <PdfMenu company={company} />
            </div>
          </div>
          <div className="flex overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-[#3289FF] text-[#3289FF]"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-6" />

      {/* Sales Intelligence Panel — shown on Overview tab only (redundant elsewhere) */}
      {activeTab === "overview" && company.salesIntelligence && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Opportunity Value */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Opportunity Value</h3>
                <InfoHint
                  title="How big the prize is"
                  lines={[
                    "Deal economics — independent of how easy it is to win.",
                    "Revenue / budget band: bigger company = more budget.",
                    "Solution breadth: how many Techolution solutions fit.",
                    "Expansion path: room to grow the account over time.",
                    "High = a large, well-funded target.",
                  ]}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${
                  company.salesIntelligence.opportunityValue.score >= 7 ? "text-emerald-600" :
                  company.salesIntelligence.opportunityValue.score >= 5 ? "text-[#3289FF]" :
                  "text-amber-600"
                }`}>{company.salesIntelligence.opportunityValue.score}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">/10</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">First Year</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{company.salesIntelligence.opportunityValue.estimatedFirstYear}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Expansion</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{company.salesIntelligence.opportunityValue.estimatedExpansion}</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">{company.salesIntelligence.opportunityValue.reasoning}</p>
          </div>

          {/* Sales Motion */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sales Motion</h3>
                <InfoHint
                  title="How easy & fast to win"
                  lines={[
                    "Execution difficulty — independent of deal size.",
                    "Org agility: smaller / nimbler = easier and faster.",
                    "Build-vs-buy: no in-house AI team = more likely to buy than build.",
                    "Decision simplicity: one clear budget owner = easier.",
                    "High = a quick close (says nothing about deal size).",
                  ]}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${
                  company.salesIntelligence.salesMotion.score >= 7 ? "text-emerald-600" :
                  company.salesIntelligence.salesMotion.score >= 5 ? "text-[#3289FF]" :
                  "text-amber-600"
                }`}>{company.salesIntelligence.salesMotion.score}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">/10</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <SalesMotionBadge motion={company.salesIntelligence.salesMotion.motion} />
              <span className="text-xs text-slate-400 dark:text-slate-500">{company.salesIntelligence.salesMotion.cycleLength}</span>
            </div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-slate-500 dark:text-slate-400">Build vs Buy Risk</span>
              <span className={`font-medium ${
                company.salesIntelligence.salesMotion.buildVsBuyRisk === "Low" ? "text-emerald-600" :
                company.salesIntelligence.salesMotion.buildVsBuyRisk === "Medium" ? "text-amber-600" :
                "text-red-600"
              }`}>{company.salesIntelligence.salesMotion.buildVsBuyRisk}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{company.salesIntelligence.salesMotion.reasoning}</p>
          </div>
        </div>
      )}

      {/* TAB: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <Card title="Executive Summary">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{company.execSummary}</p>
          </Card>

          {company.businessDescription && (
            <Card title="Business Overview">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{company.businessDescription}</p>
            </Card>
          )}

          <Card title="Score Breakdown">
            <ScoringMethodology />
            <div className="space-y-3">
              {([
                ["budgetSignal", "Budget Signal", 25],
                ["solutionFit", "Solution Fit", 25],
                ["triggerRecency", "Trigger Recency", 20],
                ["aiMaturity", "AI Maturity", 15],
                ["geminiAlignment", "Gemini Alignment", 15],
              ] as const).map(([key, label, max]) => {
                const dim = company.scores?.[key];
                if (!dim) return null;
                const pct = (dim.points / max) * 100;
                return (
                  <div key={key} className="border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-label">{label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        pct >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                        pct >= 60 ? "bg-[rgba(50,137,255,0.08)] text-[#3289FF]" :
                        pct >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}>{dim.points}/{max}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2">
                      <div className={`h-full rounded-full ${
                        pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-[#3289FF]" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{dim.reasoning}</p>
                    <Sources sources={dim.sources} />
                  </div>
                );
              })}
            </div>
          </Card>

          {company.techLandscape && (
            <Card title="Technology Landscape">
              <TechLandscapePanel tech={company.techLandscape} />
            </Card>
          )}
        </div>
      )}

      {/* TAB: Intelligence */}
      {activeTab === "intelligence" && (
        <div className="space-y-6">
          <Card title="Trigger Events" subtitle={`${company.triggerEvents?.length || 0} events identified`}>
            <div className="space-y-2">
              {company.triggerEvents?.map((t, i) => (
                <CollapsibleItem
                  key={i}
                  className="border-l-2 border-[#3289FF]/30 pl-4 py-2"
                  header={
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="badge">{t.date}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${categoryBadgeColors[t.category] || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{t.category}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.event}</p>
                    </div>
                  }
                >
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">{t.detail}</p>
                  <div className="bg-[rgba(50,137,255,0.04)] border border-[#3289FF]/10 rounded px-3 py-2">
                    <p className="text-sm text-slate-700 dark:text-slate-300"><span className="font-semibold text-[#3289FF]">Impact:</span> {t.impact}</p>
                  </div>
                  <Sources sources={t.sources} />
                </CollapsibleItem>
              ))}
            </div>
          </Card>

          <Card title="Pain Points" subtitle={`${company.painPoints?.length || 0} pain points identified`}>
            <div className="space-y-2">
              {company.painPoints?.map((p, i) => (
                <CollapsibleItem
                  key={i}
                  className="border-l-2 border-orange-400/40 pl-4 py-2"
                  header={
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${severityBadgeColors[p.severity] || ""}`}>{p.severity}</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.title}</span>
                    </div>
                  }
                >
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">{p.description}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.affectedFunctions?.map(f => (
                      <span key={f} className="badge">{f}</span>
                    ))}
                  </div>
                  {p.techolutionSolutions?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-slate-400 dark:text-slate-500">Solutions:</span>
                      {p.techolutionSolutions.map(s => (
                        <span key={s} className="text-xs bg-[rgba(50,137,255,0.08)] text-[#3289FF] px-1.5 py-0.5 rounded">{solName(s)}</span>
                      ))}
                    </div>
                  )}
                  <Sources sources={p.sources} />
                </CollapsibleItem>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB: GTM Strategy */}
      {activeTab === "gtm" && company.gtm && (
        <div className="space-y-6">
          <div className="bg-[rgba(50,137,255,0.04)] border border-[#3289FF]/15 rounded-lg px-5 py-4 flex gap-3">
            <span className="text-[#3289FF] text-lg shrink-0">i</span>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              These strategic recommendations represent analytical assessment, inferred from publicly available research, financial reports, and organizational data collected for this company. Expand <strong>&ldquo;Why this recommendation&rdquo;</strong> on any section to see the underlying reasoning and sources.
            </p>
          </div>

          <Card title="1-Page GTM Brief">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{company.gtm.brief}</p>
            {company.gtm.briefSources && company.gtm.briefSources.length > 0 && <Sources sources={company.gtm.briefSources} />}
          </Card>

          <Card title="Entry Strategy" subtitle="How we get in the door and expand over time.">
            <div className="bg-[rgba(50,137,255,0.04)] border border-[#3289FF]/15 rounded-lg px-4 py-3 mb-4">
              <p className="text-label text-[#3289FF] mb-1">Recommended Entry</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{solName(company.gtm.entrySolution)}</p>
            </div>

            <div className="space-y-2 mb-4">
              {company.gtm.entryStrategy?.map((s, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-[rgba(50,137,255,0.08)] text-[#3289FF] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>

            <div className="bg-orange-50/50 dark:bg-orange-900/30 border border-orange-200/60 dark:border-slate-700 rounded-lg px-4 py-3 mb-4">
              <p className="text-label text-orange-600 dark:text-orange-300 mb-1">Urgency</p>
              <div className="flex items-center gap-2 mb-1">
                <UrgencyBadge urgency={company.gtm.urgency} />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{company.gtm.urgencyReasoning}</p>
              {company.gtm.urgencySources && company.gtm.urgencySources.length > 0 && <Sources sources={company.gtm.urgencySources} />}
            </div>

            {company.gtm.expandPath && (
              <div className="mb-4">
                <p className="text-label text-purple-600 dark:text-purple-300 mb-2">Expansion Path</p>
                <div className="flex flex-wrap items-center gap-2">
                  {company.gtm.expandPath.split(/→|->|➜|➡|,|;|\d+\.\s+/).map(s => s.trim()).filter(Boolean).map((step, i, arr) => (
                    <span key={i} className="flex items-center gap-2">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium">{step}</span>
                      {i < arr.length - 1 && <span className="text-slate-400 dark:text-slate-500">&rarr;</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <p className="text-label mb-2">Competitive Positioning</p>
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-4 py-3">
                <NumberedList text={company.gtm.competitivePositioning} />
                {company.gtm.competitiveSources && company.gtm.competitiveSources.length > 0 && <Sources sources={company.gtm.competitiveSources} />}
              </div>
            </div>

            <WhyRecommendation reasoning={company.gtm.entrySolutionReasoning} sources={company.gtm.entrySolutionSources || company.gtm.sources} />
          </Card>

          {company.gtm.pilotStrategy && (
            <Card title="Pilot Strategy" subtitle="The first project we propose to prove value.">
              <div className="bg-emerald-50/50 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-slate-700 rounded-lg p-4">
                <p className="text-base font-semibold text-emerald-800 dark:text-emerald-300 mb-3">{company.gtm.pilotStrategy.title}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {([
                    ["Scope", company.gtm.pilotStrategy.scope],
                    ["Duration", company.gtm.pilotStrategy.duration],
                    ["Success Metric", company.gtm.pilotStrategy.successMetric],
                    ["Budget", company.gtm.pilotStrategy.estimatedBudget],
                  ] as const).map(([label, val]) => (
                    <div key={label}>
                      <span className="text-label text-emerald-600 dark:text-emerald-300">{label}:</span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 ml-2">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <Sources sources={company.gtm.sources} />
        </div>
      )}

      {/* TAB: Solution Mapping */}
      {activeTab === "solutions" && (
        <div className="space-y-6">
          <Card title="Solution Mapping" subtitle="Their problem, what we sell, what they get." action={<FitScoreMethodology />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-center text-label px-3 py-2 w-10">#</th>
                    <th className="text-left text-label px-3 py-2">Problem</th>
                    <th className="text-left text-label px-3 py-2">Techolution Capability</th>
                    <th className="text-left text-label px-3 py-2 w-32">Fit Score</th>
                    <th className="text-left text-label px-3 py-2">Expected Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {company.solutionMappings?.map((m, i) => (
                    <SolutionMappingRow key={i} index={i + 1} mapping={m} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: Partner Landscape */}
      {activeTab === "partners" && (
        <div className="space-y-6">
          <Card title="Partner Landscape" subtitle="Their current vendors, what's covered, and where Techolution wins.">
            <PartnerLandscapePanel partners={company.partnerLandscape || []} />
          </Card>
        </div>
      )}

      {/* TAB: Stakeholders */}
      {activeTab === "stakeholders" && (
        <div className="space-y-6">
          {pendingReuse.length > 0 && (
            <div className="space-y-2">
              {pendingReuse.map(p => (
                <div key={p.name} className="card p-4 flex items-center justify-between border-amber-200 dark:border-slate-700 bg-amber-50/40 dark:bg-slate-800/60">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      <span className="font-semibold">{p.name}</span> already analyzed
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Last updated {p.updated_at ? new Date(p.updated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "recently"} &middot; reusing skips the LinkedIn scrape
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReuseDecision({ name: p.name, company: p.company, title: p.title }, "reuse")}
                      disabled={resolvingReuse === p.name}
                      className="btn-primary text-xs disabled:opacity-50"
                    >
                      {resolvingReuse === p.name ? "Working…" : "Use existing"}
                    </button>
                    <button
                      onClick={() => handleReuseDecision({ name: p.name, company: p.company, title: p.title }, "refresh")}
                      disabled={resolvingReuse === p.name}
                      className="btn-ghost text-xs disabled:opacity-50"
                    >
                      Re-analyze
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {company.stakeholders?.length > 0 && (
            <Card
              title="Key Stakeholders"
              subtitle={`${company.stakeholders.length} contacts identified`}
              action={
                <button
                  onClick={handleDeepAnalyze}
                  disabled={analyzing || selected.size === 0}
                  className="btn-primary text-xs disabled:opacity-50"
                >
                  {analyzing ? "Queuing…" : `Deep-analyze ${selected.size} selected`}
                </button>
              }
            >
              <div className="flex flex-wrap gap-4 mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#3289FF]" />
                  <span className="text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Decision Maker</span> — Budget authority & final sign-off</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Champion</span> — Internal advocate driving tech adoption</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Influencer</span> — Domain expert shaping decisions</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mb-5 pb-4 border-b border-slate-100 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Confidence:</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700">Verified</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Name confirmed on source page</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700">Likely</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Known executive, source behind paywall</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700">Unverified</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Confirm before outreach</span>
              </div>
              {(["Decision Maker", "Champion", "Influencer"] as const).map(tier => {
                const tierList = company.stakeholders.filter(s => s.tier === tier);
                if (tierList.length === 0) return null;
                const tc = tierColors[tier];
                return (
                  <div key={tier} className="mb-4 last:mb-0">
                    <p className="text-label mb-2">{tier}s</p>
                    <div className="grid md:grid-cols-2 gap-2">
                      {tierList.map((s, i) => {
                        const deep = deepByName.get(normalizeStakeholderName(s.name));
                        const isAnalyzed = deep?.status === "completed";
                        const isAnalyzing = deep != null && !isAnalyzed;
                        return (
                        <div key={i} className={`${tc.bg} border ${tc.border} rounded-lg p-3`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              {!deep ? (
                                <input
                                  type="checkbox"
                                  checked={selected.has(s.name)}
                                  onChange={() => toggleSelect(s.name)}
                                  className="mt-1 shrink-0 accent-[#3289FF] cursor-pointer"
                                />
                              ) : (
                                <span className="mt-0.5 shrink-0 w-4 flex justify-center" aria-hidden="true">
                                  {isAnalyzed ? (
                                    <span className="text-emerald-600 text-sm leading-none">&#10003;</span>
                                  ) : (
                                    <span className="inline-block w-3 h-3 rounded-full border-2 border-[#3289FF]/30 border-t-[#3289FF] animate-spin" />
                                  )}
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.name}</p>
                                  {isAnalyzed && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700">
                                      Analyzed &#10003;
                                    </span>
                                  )}
                                  {isAnalyzing && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(50,137,255,0.08)] text-[#3289FF] border border-[#3289FF]/20">
                                      Analyzing&hellip;
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.title}</p>
                              </div>
                            </div>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${tc.badge}`}>{s.tier}</span>
                          </div>
                          {isAnalyzed && deep && (
                            <div className="flex items-center gap-3 mt-2">
                              <button
                                onClick={() => openDrawer(deep.id, { name: s.name, title: s.title, company: company.name })}
                                className="btn-primary text-xs"
                              >
                                View profile
                              </button>
                              <button
                                onClick={() => handleReanalyze(s.name, s.title)}
                                className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:underline cursor-pointer"
                              >
                                Re-analyze
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">{s.relevance}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              Source: {s.sourceUrl
                                ? <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#3289FF] hover:underline">{s.source}</a>
                                : s.source}
                            </p>
                            {s.confidence && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                s.confidence === "verified" ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700" :
                                s.confidence === "likely" ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700" :
                                "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700"
                              }`}>
                                {s.confidence === "verified" ? "Verified" : s.confidence === "likely" ? "Likely" : "Unverified"}
                              </span>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Manually added stakeholders (not in the AI-found list) */}
          {manualRows.length > 0 && (
            <Card title="Manually added" subtitle={`${manualRows.length} added by you`}>
              <div className="grid md:grid-cols-2 gap-2">
                {manualRows.map((d) => {
                  const done = d.status === "completed";
                  return (
                    <div key={d.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{d.name}</p>
                            {done ? (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700">Analyzed &#10003;</span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(50,137,255,0.08)] text-[#3289FF] border border-[#3289FF]/20">Analyzing&hellip;</span>
                            )}
                          </div>
                          {d.title && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{d.title}</p>}
                          {d.company && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{d.company}</p>}
                        </div>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Manual</span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        {done && (
                          <button
                            onClick={() => openDrawer(d.id, { name: d.name, title: d.title ?? undefined, company: d.company ?? company.name })}
                            className="btn-primary text-xs"
                          >
                            View profile
                          </button>
                        )}
                        {d.linkedin_url && (
                          <a href={d.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#3289FF] hover:underline">LinkedIn</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Add a stakeholder the research missed — scoped to this company */}
          <div>
            {!addOpen ? (
              <button onClick={() => { setAddCompany(company.name); setAddOpen(true); }} className="btn-ghost text-sm">
                + Add stakeholder
              </button>
            ) : (
              <Card title="Add stakeholder" subtitle="Adds to this company and runs a deep analysis">
                <div className="grid sm:grid-cols-2 gap-2">
                  <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Full name *" className="input-field text-sm" />
                  <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="Title (optional)" className="input-field text-sm" />
                  <input value={addCompany} onChange={(e) => setAddCompany(e.target.value)} placeholder="Company" className="input-field text-sm" />
                  <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="LinkedIn URL (optional)" className="input-field text-sm" />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={handleManualAdd} disabled={addBusy || !addName.trim()} className="btn-primary text-xs disabled:opacity-50">
                    {addBusy ? "Adding…" : "Add & analyze"}
                  </button>
                  <button onClick={() => { setAddOpen(false); setAddName(""); setAddTitle(""); setAddUrl(""); }} className="btn-ghost text-xs">
                    Cancel
                  </button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* TAB: Stakeholder Matrix */}
      {activeTab === "matrix" && (
        <div className="space-y-6">
          <Card title="Stakeholder Decision Matrix" subtitle="Who sponsors, approves, or gates each offering — and how to approach them.">
            {company.stakeholderOfferingMatrix ? (
              <StakeholderMatrixPanel
                matrix={company.stakeholderOfferingMatrix}
                projectId={projectId}
                deepByName={deepByName}
                onDeepResearch={handleMatrixDeepResearch}
                onOpenDeep={(id, name, title) => openDrawer(id, { name, title, company: company.name })}
              />
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">
                No stakeholder matrix available. Re-run research on this company to generate it.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* TAB: Sources */}
      {activeTab === "sources" && (
        <Card title="Sources" subtitle={`${allSources.length} sources referenced`}>
          <div className="space-y-1.5">
            {allSources.map((s, i) => (
              <div key={i} className="text-xs flex gap-2 items-start py-0.5">
                <span className="text-slate-400 dark:text-slate-500 shrink-0 font-mono w-6 text-right">[{i + 1}]</span>
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#3289FF] hover:underline">{s.label}</a>
                  <span className="text-slate-400 dark:text-slate-500 ml-1">&mdash; {s.type} &mdash; {s.date}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <StakeholderDrawer
        stakeholderId={drawerId}
        projectId={projectId}
        fallback={drawerFallback}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}

/* Card component */
function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="heading-section text-xl mb-0.5">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{subtitle}</p>}
          {!subtitle && <div className="mb-4" />}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/* Truncated text with Read more */
function TruncatedText({ text, maxChars, className = "" }: { text: string; maxChars: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxChars;
  const displayed = !needsTruncation || expanded ? text : text.slice(0, maxChars).replace(/\s+\S*$/, "") + "...";
  return (
    <div>
      <p className={`text-sm leading-relaxed ${className}`}>{displayed}</p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#3289FF] hover:underline mt-1 cursor-pointer"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/* Scoring Methodology (expandable) */
function ScoringMethodology() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 bg-[#F8FAFF] dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#3289FF] text-sm font-bold">100</span>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Each company is scored on a <span className="font-semibold">100-point scale</span> across 5 dimensions.
            Rating: A (80+) &middot; B (65-79) &middot; C (50-64) &middot; D (&lt;50)
          </p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-[#3289FF] hover:underline cursor-pointer whitespace-nowrap ml-3"
        >
          {open ? "Hide details" : "How scoring works"}
        </button>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-5">
          {[
            {
              label: "Budget Signal", pts: "25 pts",
              desc: "Evidence of AI/tech investment from public filings, press releases, and CXO statements.",
              rubric: [
                { range: "22-25", criteria: "Disclosed AI/tech budget with specific dollar amounts, active venture arm funding AI startups, public CIO/CTO statements committing to AI transformation." },
                { range: "16-21", criteria: "General digital transformation commitment in earnings calls, capex increases mentioning technology, AI hiring signals." },
                { range: "10-15", criteria: "Broad technology mentions in annual reports without specifics, general cloud migration underway." },
                { range: "0-9", criteria: "No public evidence of tech investment, cost-cutting mode, or insufficient data." },
              ],
            },
            {
              label: "Solution Fit", pts: "25 pts",
              desc: "How many Techolution solutions map to the company's pain points, weighted by priority and proof points.",
              rubric: [
                { range: "22-25", criteria: "3+ solutions map with Primary priority, same-industry proof points exist, pain points directly match." },
                { range: "16-21", criteria: "2+ Primary solutions with clear alignment, at least one same-industry case study." },
                { range: "10-15", criteria: "1-2 solutions map at Primary/Secondary level, adjacent-industry proof points." },
                { range: "0-9", criteria: "Solutions are a stretch fit, pain points don't clearly align with portfolio." },
              ],
            },
            {
              label: "Trigger Recency", pts: "20 pts",
              desc: "How recent and urgent are trigger events (M&A, leadership change, earnings pressure, regulatory deadlines).",
              rubric: [
                { range: "17-20", criteria: "Multiple active triggers announced in last 3 months with explicit deadlines." },
                { range: "12-16", criteria: "Recent triggers (3-6 months old) still in play. Leadership change settling in, M&A integration ongoing." },
                { range: "6-11", criteria: "Triggers are 6-12 months old. Impact is real but urgency has faded." },
                { range: "0-5", criteria: "No recent triggers, or triggers 12+ months old and likely addressed." },
              ],
            },
            {
              label: "AI Maturity", pts: "15 pts",
              desc: "Current AI adoption level (1-5). Sweet spot is Level 2-3: sophisticated enough to buy, with gaps to fill.",
              rubric: [
                { range: "12-15", criteria: "Level 2-3: Active AI exploration/piloting with gaps in Techolution areas." },
                { range: "8-11", criteria: "Level 3-4: Scaling AI but specific gaps exist in contracts, scheduling, voice, or search." },
                { range: "4-7", criteria: "Level 1-2: Early stage, limited capability. Or Level 4-5 with few remaining gaps." },
                { range: "0-3", criteria: "Level 1: No AI adoption. Or Level 5: AI-saturated with no clear gaps." },
              ],
            },
            {
              label: "Gemini Alignment", pts: "15 pts",
              desc: "Google Workspace and Gemini Enterprise presence. Determines Gemini Land/Expand opportunity.",
              rubric: [
                { range: "12-15", criteria: "Expand target: Google Workspace + Gemini. Or confirmed GWS with strong GE interest." },
                { range: "8-11", criteria: "Land target: On Google Workspace but no Gemini Enterprise yet." },
                { range: "4-7", criteria: "Mixed environment or in active evaluation. Gemini possible but uncertain." },
                { range: "0-3", criteria: "Confirmed Microsoft 365 / non-Google stack. Gemini unlikely." },
              ],
            },
          ].map((d) => (
            <div key={d.label} className="border border-slate-100 dark:border-slate-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-[#3289FF] bg-[rgba(50,137,255,0.08)] px-2 py-0.5 rounded">{d.pts}</span>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{d.label}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">{d.desc}</p>
              <div className="space-y-1.5">
                {d.rubric.map((r, i) => (
                  <div key={r.range} className="flex gap-2">
                    <span className={`text-[10px] font-bold w-12 shrink-0 text-right mt-0.5 ${
                      i === 0 ? "text-emerald-600" : i === 1 ? "text-[#3289FF]" : i === 2 ? "text-amber-600" : "text-slate-400 dark:text-slate-500"
                    }`}>{r.range}</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{r.criteria}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Fit Score Methodology (expandable) */
function FitScoreMethodology() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-[#3289FF] border border-slate-200 dark:border-slate-700 hover:border-[#3289FF]/30 rounded-lg transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        How Scoring Works
      </button>
      {open && (
        <div className="mt-3 bg-[#F8FAFF] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-5 text-left">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Each solution is scored on a <span className="font-bold">100-point scale</span> across 4 dimensions. Rating: 85+ Strong &middot; 70-84 Good &middot; 55-69 Fair &middot; &lt;55 Weak</p>
          <div className="border-t border-slate-200 dark:border-slate-700 my-3" />
          <div className="space-y-4">
            {[
              { label: "Pain Severity & Specificity", pts: "25 pts", color: "bg-blue-500",
                rubric: ["22-25 · Acute, quantified pain with clear urgency and executive visibility.", "17-21 · Documented pain with business impact but not yet critical.", "10-16 · Known challenge but vague on severity or timeline.", "0-9 · Generic industry pain, no company-specific evidence."] },
              { label: "Budget Evidence & Active Need", pts: "25 pts", color: "bg-emerald-500",
                rubric: ["22-25 · Disclosed budget, active RFP, or confirmed investment timeline.", "17-21 · Earnings call mentions, hiring for related roles, or vendor evaluations.", "10-16 · General digital transformation budget but no specific allocation.", "0-9 · No public evidence of budget or investment intent."] },
              { label: "Proof Point Relevance", pts: "25 pts", color: "bg-amber-500",
                rubric: ["22-25 · Same industry, similar scale, matching use case with quantified outcomes.", "17-21 · Adjacent industry or different scale but strong use-case match.", "10-16 · Generic enterprise proof point, loosely applicable.", "0-9 · No directly relevant proof point available."] },
              { label: "Impact Magnitude", pts: "25 pts", color: "bg-purple-500",
                rubric: ["22-25 · Transformative impact — 8-figure savings or major competitive advantage.", "17-21 · Significant operational improvement with clear ROI.", "10-16 · Moderate efficiency gains, limited strategic differentiation.", "0-9 · Marginal improvement, hard to quantify value."] },
            ].map(d => (
              <div key={d.label} className="border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-sm ${d.color} shrink-0`} />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{d.pts} &middot; {d.label}</span>
                </div>
                <div className="ml-[18px] space-y-0.5">
                  {d.rubric.map((r, i) => (
                    <p key={i} className={`text-[10px] leading-relaxed ${i === 0 ? "text-emerald-600" : i === 1 ? "text-[#3289FF]" : i === 2 ? "text-amber-600" : "text-slate-400 dark:text-slate-500"}`}>{r}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Fit Score Dimensions */
const FIT_DIMENSIONS = [
  { key: "painSeverity" as const, label: "Pain Severity", color: "bg-blue-500" },
  { key: "budgetEvidence" as const, label: "Budget Evidence", color: "bg-emerald-500" },
  { key: "proofRelevance" as const, label: "Proof Relevance", color: "bg-amber-500" },
  { key: "impactMagnitude" as const, label: "Impact", color: "bg-purple-500" },
];

/* Solution mapping row with expandable reasoning */
function SolutionMappingRow({ index, mapping: m }: { index: number; mapping: SolutionMapping }) {
  const [open, setOpen] = useState(false);
  const barColor = m.fitScore != null
    ? m.fitScore >= 85 ? "bg-emerald-500" : m.fitScore >= 70 ? "bg-blue-500" : m.fitScore >= 55 ? "bg-amber-500" : "bg-slate-400"
    : "bg-slate-300";
  const badgeColor = m.fitScore != null
    ? m.fitScore >= 85 ? "text-emerald-700 dark:text-emerald-400" : m.fitScore >= 70 ? "text-blue-700 dark:text-blue-400" : m.fitScore >= 55 ? "text-amber-700 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"
    : "text-slate-500 dark:text-slate-400";
  const bd = m.fitScoreBreakdown;
  return (
    <>
      <tr
        className={`border-t border-slate-100 dark:border-slate-700 group ${open ? "bg-slate-50/50 dark:bg-slate-800/60" : "hover:bg-[rgba(50,137,255,0.03)]"} transition-colors cursor-pointer`}
        onClick={() => setOpen(!open)}
      >
        <td className="px-3 py-3 text-center text-slate-400 dark:text-slate-500 text-xs font-medium">{index}</td>
        <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{m.painPoint}</td>
        <td className="px-3 py-3"><span className="text-[#3289FF] font-medium">{m.solutionName}</span></td>
        <td className="px-3 py-3">
          {m.fitScore != null && (
            <div className="flex items-center gap-2 min-w-[120px]">
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${m.fitScore}%` }} />
              </div>
              <span className={`text-xs font-bold w-8 text-right shrink-0 ${badgeColor}`}>{m.fitScore}</span>
            </div>
          )}
          {m.fitScore == null && <span className="text-xs text-slate-400 dark:text-slate-500">&mdash;</span>}
        </td>
        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <span>{m.value}</span>
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {open ? "Hide" : "Details"}
              </span>
              <svg className={`w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-[#3289FF] transition-all ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-3 pb-4 pt-0">
            <div className="bg-[#F8FAFF] dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg p-4 space-y-3">
              {bd && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Fit Score Breakdown</p>
                  <div className="space-y-1.5 max-w-sm">
                    {FIT_DIMENSIONS.map(d => {
                      const pts = bd[d.key] ?? 0;
                      const pct = (pts / 25) * 100;
                      return (
                        <div key={d.key} className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 w-24 shrink-0">{d.label}</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`h-full rounded-full ${d.color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-10 text-right">{pts}/25</span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-24 shrink-0">Total</span>
                      <div className="flex-1" />
                      <span className={`text-sm font-bold ${badgeColor}`}>{m.fitScore}/100</span>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Why This Solution Fits</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{m.reasoning}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {m.estimatedImpact && (
                  <ImpactSection impact={m.estimatedImpact} />
                )}
                {m.proofPoint && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Proof Point</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <span className="font-medium">{m.proofPoint.client}</span>
                      {m.proofPoint.relevance && <> &mdash; {m.proofPoint.relevance}</>}
                      {m.proofPoint.outcome && <><br /><span className="text-emerald-600">{m.proofPoint.outcome}</span></>}
                    </p>
                  </div>
                )}
              </div>
              {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* Estimated Impact — supports both legacy string and structured object */
function ImpactSection({ impact }: { impact: string | EstimatedImpact }) {
  const [showReasoning, setShowReasoning] = useState(false);

  // Legacy: plain string
  if (typeof impact === "string") {
    return (
      <div>
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Estimated Impact</p>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{impact}</p>
      </div>
    );
  }

  // Structured: summary + reasoning breakdown
  return (
    <div className="col-span-full">
      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Estimated Impact</p>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{impact.summary}</p>
      {impact.reasoning?.length > 0 && (
        <>
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center gap-1 text-xs text-[#3289FF] hover:underline cursor-pointer mb-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showReasoning ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            How we got this number
          </button>
          {showReasoning && (
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg p-3 space-y-1.5">
              {impact.reasoning.map((line, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 shrink-0">{i + 1}.</span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{line}</p>
                </div>
              ))}
              {impact.sources && impact.sources.length > 0 && <Sources sources={impact.sources} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* Sales Motion Badge */
const MOTION_STYLES: Record<SalesMotionType, string> = {
  "Quick Win": "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-slate-700",
  "Land & Expand": "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-slate-700",
  "Strategic Sale": "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-slate-700",
  "Long Cycle": "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-slate-700",
};

function SalesMotionBadge({ motion }: { motion: SalesMotionType }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${MOTION_STYLES[motion] || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"}`}>
      {motion}
    </span>
  );
}

/* Why this recommendation (expandable) */
function WhyRecommendation({ reasoning, sources, label }: { reasoning: string; sources?: Source[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-[#3289FF] transition-colors cursor-pointer"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {label || "Why this recommendation"}
      </button>
      {open && (
        <div className="mt-2 bg-emerald-50/50 dark:bg-emerald-900/30 border border-emerald-200/60 dark:border-slate-700 rounded-lg px-4 py-3">
          <p className="text-label text-emerald-600 dark:text-emerald-300 mb-1">Why This Works</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{reasoning}</p>
          {sources && <Sources sources={sources} />}
        </div>
      )}
    </div>
  );
}
