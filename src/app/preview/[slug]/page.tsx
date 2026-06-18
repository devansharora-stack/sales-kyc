"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CompanyDetail, Source, SolutionId } from "@/lib/types";
import { ALL_SOLUTIONS } from "@/lib/types";
import RatingBadge from "@/components/company/RatingBadge";
import GeminiStatusBadge from "@/components/company/GeminiStatusBadge";
import UrgencyBadge from "@/components/company/UrgencyBadge";
import ScoreBar from "@/components/company/ScoreBar";
import Sources from "@/components/company/Sources";
import TechLandscapePanel from "@/components/company/TechLandscapePanel";
import NumberedList from "@/components/company/NumberedList";
import CollapsibleItem from "@/components/company/CollapsibleItem";

const solName = (id: SolutionId | string) =>
  ALL_SOLUTIONS.find((s) => s.id === id)?.name ?? id;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "intelligence", label: "Intelligence" },
  { id: "gtm", label: "GTM Strategy" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "sources", label: "Sources" },
];

const categoryBadgeColors: Record<string, string> = {
  "M&A": "bg-purple-100 text-purple-800",
  Leadership: "bg-blue-100 text-blue-800",
  "Earnings Pressure": "bg-red-100 text-red-800",
  Regulatory: "bg-orange-100 text-orange-800",
  "Legacy Systems": "bg-amber-100 text-amber-800",
  "Competitor Pressure": "bg-pink-100 text-pink-800",
  "Digital Transformation": "bg-emerald-100 text-emerald-800",
  Workforce: "bg-cyan-100 text-cyan-800",
};

const severityBadgeColors: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
};

const tierColors = {
  "Decision Maker": { bg: "bg-[rgba(50,137,255,0.04)]", border: "border-[#3289FF]/20", badge: "bg-[rgba(50,137,255,0.08)] text-[#3289FF]" },
  Champion: { bg: "bg-emerald-50/50", border: "border-emerald-200/60", badge: "bg-emerald-100 text-emerald-800" },
  Influencer: { bg: "bg-amber-50/50", border: "border-amber-200/60", badge: "bg-amber-100 text-amber-800" },
} as const;

export default function PreviewPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/preview/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setCompany)
      .catch(() => setError(true));
  }, [slug]);

  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-sm text-slate-500 mb-3">
          Profile not found. Run the pipeline first:
        </p>
        <code className="text-xs bg-slate-100 px-3 py-1 rounded">
          npx tsx test-full-pipeline.ts &quot;Company Name&quot;
        </code>
      </div>
    );

  if (!company)
    return (
      <div className="text-center py-20">
        <div className="h-6 w-6 border-2 border-[#3289FF] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-400 mt-3">Loading preview...</p>
      </div>
    );

  const allSources: Source[] = [];
  const seen = new Set<string>();
  const add = (s?: Source[]) => {
    s?.forEach((src) => {
      if (!seen.has(src.url)) {
        seen.add(src.url);
        allSources.push(src);
      }
    });
  };
  add(company.sources);
  company.triggerEvents?.forEach((t) => add(t.sources));
  company.painPoints?.forEach((p) => add(p.sources));
  company.solutionMappings?.forEach((m) => add(m.sources));
  add(company.gtm?.sources);
  add(company.revenue?.sources);
  add(company.employees?.sources);
  const tl = company.techLandscape;
  if (tl) {
    add(tl.cloudProviders?.sources);
    add(tl.workspacePlatform?.sources);
    add(tl.knownAIDeployments?.sources);
    add(tl.knownVendors?.sources);
    add(tl.knownSystems?.sources);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
          LOCAL PREVIEW
        </span>
        <span className="text-xs text-slate-400">
          from test-output/{company.slug}.json
        </span>
      </div>

      {/* Company Hero Card */}
      <div className="card p-0 mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-[#F8FAFF] to-white px-6 py-5 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="heading-display text-3xl mb-1">{company.name}</h1>
              {company.fullName !== company.name && (
                <p className="text-sm text-slate-500">{company.fullName}</p>
              )}
              <p className="text-sm text-slate-400 mt-1">
                {company.industry} &middot; {company.subSector} &middot;{" "}
                {company.hqCity}, {company.state}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-baseline gap-1.5">
                <span className="stat-value text-3xl">{company.totalScore}</span>
                <span className="text-slate-400 text-sm">/100</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RatingBadge rating={company.rating} showLabel size="md" />
                <GeminiStatusBadge status={company.geminiStatus} />
                <UrgencyBadge urgency={company.gtm?.urgency || "Medium"} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-slate-100">
          <div className="px-5 py-3">
            <p className="text-label">Revenue</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{company.revenue?.value || "N/A"}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-label">Employees</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{company.employees?.value || "N/A"}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-label">Triggers</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{company.triggerEvents?.length || 0} events</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-label">Stakeholders</p>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{company.stakeholders?.length || 0} contacts</p>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 bg-white">
          <ScoreBar scores={company.scores} total={company.totalScore} />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm -mx-4 lg:-mx-8 px-4 lg:px-8 mb-6">
        <div className="flex border-b border-[#E2E8F0] overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-[#3289FF] text-[#3289FF]"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <Card title="Executive Summary">
            <p className="text-sm text-slate-700 leading-relaxed">{company.execSummary}</p>
          </Card>
          {company.businessDescription && (
            <Card title="Business Overview">
              <p className="text-sm text-slate-600 leading-relaxed">{company.businessDescription}</p>
            </Card>
          )}
          <Card title="Score Breakdown">
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
                  <div key={key} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-label">{label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        pct >= 80 ? "bg-emerald-100 text-emerald-700" :
                        pct >= 60 ? "bg-[rgba(50,137,255,0.08)] text-[#3289FF]" :
                        pct >= 40 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      }`}>{dim.points}/{max}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                      <div className={`h-full rounded-full ${
                        pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-[#3289FF]" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{dim.reasoning}</p>
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
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${categoryBadgeColors[t.category] || "bg-slate-100 text-slate-600"}`}>{t.category}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{t.event}</p>
                    </div>
                  }
                >
                  <p className="text-sm text-slate-600 leading-relaxed mb-2">{t.detail}</p>
                  <div className="bg-[rgba(50,137,255,0.04)] border border-[#3289FF]/10 rounded px-3 py-2">
                    <p className="text-sm text-slate-700"><span className="font-semibold text-[#3289FF]">Impact:</span> {t.impact}</p>
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
                      <span className="text-sm font-semibold text-slate-800">{p.title}</span>
                    </div>
                  }
                >
                  <p className="text-sm text-slate-600 leading-relaxed mb-2">{p.description}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.affectedFunctions?.map((f) => <span key={f} className="badge">{f}</span>)}
                  </div>
                  {p.techolutionSolutions?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-slate-400">Solutions:</span>
                      {p.techolutionSolutions.map((s) => (
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

      {activeTab === "gtm" && company.gtm && (
        <div className="space-y-6">
          <Card title="1-Page GTM Brief">
            <p className="text-sm text-slate-700 leading-relaxed">{company.gtm.brief}</p>
          </Card>
          <Card title="Entry Strategy">
            <div className="bg-[rgba(50,137,255,0.04)] border border-[#3289FF]/15 rounded-lg px-4 py-3 mb-4">
              <p className="text-label text-[#3289FF] mb-1">Recommended Entry</p>
              <p className="text-sm font-semibold text-slate-800">{solName(company.gtm.entrySolution)}</p>
            </div>
            <div className="space-y-2 mb-4">
              {company.gtm.entryStrategy?.map((s, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-[rgba(50,137,255,0.08)] text-[#3289FF] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
            <div className="bg-orange-50/50 border border-orange-200/60 rounded-lg px-4 py-3 mb-4">
              <p className="text-label text-orange-600 mb-1">Urgency</p>
              <UrgencyBadge urgency={company.gtm.urgency} />
              <p className="text-sm text-slate-600 leading-relaxed mt-1">{company.gtm.urgencyReasoning}</p>
            </div>
            {company.gtm.expandPath && (
              <div className="mb-4">
                <p className="text-label text-purple-600 mb-2">Expansion Path</p>
                <div className="flex flex-wrap items-center gap-2">
                  {company.gtm.expandPath.split(/→|->|➜|➡|,|;|\d+\.\s+/).map((s) => s.trim()).filter(Boolean).map((step, i, arr) => (
                    <span key={i} className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium">{step}</span>
                      {i < arr.length - 1 && <span className="text-slate-400">&rarr;</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-4">
              <p className="text-label mb-2">Competitive Positioning</p>
              <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                <NumberedList text={company.gtm.competitivePositioning} />
              </div>
            </div>
            <Sources sources={company.gtm.sources} />
          </Card>
          <Card title="Solution Mapping">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left text-label px-3 py-2">Problem</th>
                    <th className="text-left text-label px-3 py-2">Techolution Capability</th>
                    <th className="text-left text-label px-3 py-2">Expected Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {company.solutionMappings?.map((m, i) => (
                    <tr key={i}>
                      <td className="px-3 py-3 text-slate-700">{m.painPoint}</td>
                      <td className="px-3 py-3"><span className="text-[#3289FF] font-medium">{m.solutionName}</span></td>
                      <td className="px-3 py-3 text-slate-600">{m.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {company.gtm.pilotStrategy && (
            <Card title="Pilot Strategy">
              <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-lg p-4">
                <p className="text-base font-semibold text-emerald-800 mb-3">{company.gtm.pilotStrategy.title}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {([
                    ["Scope", company.gtm.pilotStrategy.scope],
                    ["Duration", company.gtm.pilotStrategy.duration],
                    ["Success Metric", company.gtm.pilotStrategy.successMetric],
                    ["Budget", company.gtm.pilotStrategy.estimatedBudget],
                  ] as const).map(([label, val]) => (
                    <div key={label}>
                      <span className="text-label text-emerald-600">{label}:</span>
                      <span className="text-sm text-slate-700 ml-2">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "stakeholders" && (
        <div className="space-y-6">
          <Card title="Key Stakeholders" subtitle={`${company.stakeholders?.length || 0} contacts identified`}>
            <div className="flex flex-wrap gap-4 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#3289FF]" />
                <span className="text-xs text-slate-600"><span className="font-semibold">Decision Maker</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-600"><span className="font-semibold">Champion</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs text-slate-600"><span className="font-semibold">Influencer</span></span>
              </div>
            </div>
            {(["Decision Maker", "Champion", "Influencer"] as const).map((tier) => {
              const tierList = company.stakeholders?.filter((s) => s.tier === tier) || [];
              if (tierList.length === 0) return null;
              const tc = tierColors[tier];
              return (
                <div key={tier} className="mb-4 last:mb-0">
                  <p className="text-label mb-2">{tier}s</p>
                  <div className="grid md:grid-cols-2 gap-2">
                    {tierList.map((s, i) => (
                      <div key={i} className={`${tc.bg} border ${tc.border} rounded-lg p-3`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{s.title}</p>
                          </div>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${tc.badge}`}>{s.tier}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">{s.relevance}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-slate-400">
                            Source:{" "}
                            {s.sourceUrl ? (
                              <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#3289FF] hover:underline">
                                {s.source}
                              </a>
                            ) : (
                              s.source
                            )}
                          </p>
                          {s.confidence && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              s.confidence === "verified" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                              s.confidence === "likely" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                              "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}>
                              {s.confidence === "verified" ? "Verified" : s.confidence === "likely" ? "Likely" : "Unverified"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {activeTab === "sources" && (
        <Card title="Sources" subtitle={`${allSources.length} sources referenced`}>
          <div className="space-y-1.5">
            {allSources.map((s, i) => (
              <div key={i} className="text-xs flex gap-2 items-start py-0.5">
                <span className="text-slate-400 shrink-0 font-mono w-6 text-right">[{i + 1}]</span>
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#3289FF] hover:underline">
                    {s.label}
                  </a>
                  <span className="text-slate-400 ml-1">&mdash; {s.type} &mdash; {s.date}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="heading-section text-xl mb-0.5">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}
