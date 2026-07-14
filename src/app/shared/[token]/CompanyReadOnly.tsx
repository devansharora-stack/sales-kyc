"use client";

// Read-only company view for shared links. Same structure as the real company
// page / preview, but with all mutation controls (manual-add, re-analyze)
// removed. Pure render — the parent fetches the data.

import { useState } from "react";
import type { CompanyDetail } from "@/lib/types";
import RatingBadge from "@/components/company/RatingBadge";
import GeminiStatusBadge from "@/components/company/GeminiStatusBadge";
import UrgencyBadge from "@/components/company/UrgencyBadge";
import ScoreBar from "@/components/company/ScoreBar";
import { generateCompanyPDF, generateCompanyOnePager } from "@/lib/generate-pdf";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "intelligence", label: "Intelligence" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "sources", label: "Sources" },
];

const tierColors = {
  "Decision Maker": { bg: "bg-[rgba(50,137,255,0.04)]", border: "border-[#3289FF]/20", badge: "bg-[rgba(50,137,255,0.08)] text-[#3289FF]" },
  Champion: { bg: "bg-emerald-50/50 dark:bg-slate-800/60", border: "border-emerald-200/60 dark:border-slate-700", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  Influencer: { bg: "bg-amber-50/50 dark:bg-slate-800/60", border: "border-amber-200/60 dark:border-slate-700", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
} as const;

function PdfMenu({ company }: { company: CompanyDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#3289FF] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
        PDF
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
            <button onClick={() => { generateCompanyPDF(company); setOpen(false); }} className="block w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">Full report</button>
            <button onClick={() => { generateCompanyOnePager(company); setOpen(false); }} className="block w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-700 cursor-pointer">One-pager</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function CompanyReadOnly({ company, actions }: { company: CompanyDetail; actions?: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <div className="card p-0 mb-3 overflow-hidden">
        <div className="bg-gradient-to-r from-[#F8FAFF] to-white dark:from-slate-800/60 dark:to-slate-900 px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="heading-display text-3xl mb-1">{company.name}</h1>
              {company.fullName !== company.name && <p className="text-sm text-slate-500 dark:text-slate-400">{company.fullName}</p>}
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{company.industry} · {company.subSector} · {company.hqCity}, {company.state}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-baseline gap-1.5"><span className="stat-value text-3xl">{company.totalScore}</span><span className="text-slate-400 dark:text-slate-500 text-sm">/100</span></div>
              <div className="flex flex-wrap items-center gap-2">
                <RatingBadge rating={company.rating} showLabel size="md" />
                <GeminiStatusBadge status={company.geminiStatus} />
                <UrgencyBadge urgency={company.gtm?.urgency || "Medium"} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-slate-100 dark:divide-slate-700">
          <div className="px-5 py-3"><p className="text-label">Revenue</p><p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.revenue?.value || "N/A"}</p></div>
          <div className="px-5 py-3"><p className="text-label">Employees</p><p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.employees?.value || "N/A"}</p></div>
          <div className="px-5 py-3"><p className="text-label">Triggers</p><p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.triggerEvents?.length || 0} events</p></div>
          <div className="px-5 py-3"><p className="text-label">Stakeholders</p><p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5">{company.stakeholders?.length || 0} contacts</p></div>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          <ScoreBar scores={company.scores} total={company.totalScore} />
        </div>
      </div>

      {/* Sticky bar */}
      <div className="sticky top-0 z-30 bg-[#F8FAFC] dark:bg-slate-900 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-2">
        <div className="bg-white/95 dark:bg-slate-900 backdrop-blur-sm border-b border-[#E2E8F0] dark:border-slate-700">
          <div className="flex items-center gap-3 px-1 pt-1 pb-2">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{company.name}</h2>
            <span className="flex items-baseline gap-0.5 shrink-0"><span className="stat-value text-lg">{company.totalScore}</span><span className="text-slate-400 dark:text-slate-500 text-xs">/100</span></span>
            <RatingBadge rating={company.rating} size="md" />
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <PdfMenu company={company} />
            </div>
          </div>
          <div className="flex overflow-x-auto no-scrollbar">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? "border-[#3289FF] text-[#3289FF]" : "border-transparent text-slate-500 dark:text-slate-400"}`}>{tab.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-6" />

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="card p-6"><h2 className="heading-section text-xl mb-2">Executive Summary</h2><p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{company.execSummary}</p></div>
          {company.businessDescription && <div className="card p-6"><h2 className="heading-section text-xl mb-2">Business Overview</h2><p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{company.businessDescription}</p></div>}
          {(company.painPoints || []).map((p, i) => (
            <div key={i} className="card p-6"><h2 className="heading-section text-lg mb-1">{p.title} <span className="text-xs text-slate-400">[{p.severity}]</span></h2><p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{p.description}</p></div>
          ))}
        </div>
      )}

      {activeTab === "intelligence" && (
        <div className="space-y-6">
          {(company.triggerEvents || []).map((t, i) => (
            <div key={i} className="card p-6"><p className="text-xs text-slate-400 mb-1">{t.category} · {t.date}</p><h2 className="heading-section text-lg mb-1">{t.event}</h2><p className="text-sm text-slate-600 dark:text-slate-400">{t.detail}</p></div>
          ))}
        </div>
      )}

      {activeTab === "stakeholders" && (
        <div className="card p-6">
          <h2 className="heading-section text-xl mb-4">Key Stakeholders</h2>
          {(["Decision Maker", "Champion", "Influencer"] as const).map((tier) => {
            const list = (company.stakeholders || []).filter((s) => s.tier === tier);
            if (!list.length) return null;
            const tc = tierColors[tier];
            return (
              <div key={tier} className="mb-4 last:mb-0">
                <p className="text-label mb-2">{tier}s</p>
                <div className="grid md:grid-cols-2 gap-2">
                  {list.map((s, i) => (
                    <div key={i} className={`${tc.bg} border ${tc.border} rounded-lg p-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.name}</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.title}</p></div>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${tc.badge}`}>{s.tier}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">{s.relevance}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "sources" && (
        <div className="card p-6">
          <h2 className="heading-section text-xl mb-4">Sources</h2>
          <div className="space-y-1.5">
            {(company.sources || []).map((s, i) => (
              <div key={i} className="text-xs flex gap-2"><span className="text-slate-400 font-mono w-6 text-right">[{i + 1}]</span><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#3289FF] hover:underline">{s.label}</a></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
