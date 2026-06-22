"use client";

import { useState } from "react";
import Link from "next/link";
import offeringsData from "@/data/offerings-kb.json";

interface CaseStudy {
  client: string;
  engagement: string;
  outcome: string;
}

interface Offering {
  id: string;
  category: string;
  categoryId: string;
  subType: string | null;
  subTypeId: string;
  description: string;
  entryPoint: boolean;
  startingPrice: string | null;
  template: string | null;
  targetIndustries: string[];
  targetProfiles: string[];
  caseStudies: CaseStudy[];
}

const offerings = offeringsData.offerings as Offering[];

const CATEGORIES = Array.from(new Set(offerings.map((o) => o.category)));

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "BPA 4.0": { bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-slate-700" },
  "GE Land": { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-slate-700" },
  "GE Expand (Agent Dev)": { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-slate-700" },
  "GE Enablement": { bg: "bg-cyan-50 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-slate-700" },
  "GE Managed Services": { bg: "bg-indigo-50 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-slate-700" },
  "Managed Services": { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-slate-700" },
  "Dev": { bg: "bg-rose-50 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-slate-700" },
};

const DEFAULT_COLOR = { bg: "bg-slate-50 dark:bg-slate-800/60", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200 dark:border-slate-700" };

export default function SolutionsPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedOffering, setExpandedOffering] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = offerings.filter((o) => {
    if (activeCategory && o.category !== activeCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        o.category.toLowerCase().includes(q) ||
        (o.subType || "").toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.caseStudies.some(
          (cs) =>
            cs.client.toLowerCase().includes(q) ||
            cs.engagement.toLowerCase().includes(q) ||
            cs.outcome.toLowerCase().includes(q)
        ) ||
        o.targetIndustries.some((i) => i.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalCaseStudies = offerings.reduce((sum, o) => sum + o.caseStudies.length, 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/"
            className="text-xs text-slate-400 dark:text-slate-500 hover:text-[#3289FF] mb-1 block cursor-pointer"
          >
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            Solution Repository
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {offerings.length} offerings across {CATEGORIES.length} categories &middot;{" "}
            {totalCaseStudies} case studies
          </p>
        </div>
      </div>

      {/* Search + Category Filters */}
      <div className="card p-4 mb-6">
        <input
          type="text"
          placeholder="Search solutions, clients, industries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field w-full mb-3"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeCategory === null
                ? "bg-[#3289FF] text-white border-[#3289FF]"
                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => {
            const colors = CATEGORY_COLORS[cat] || DEFAULT_COLOR;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  isActive
                    ? `${colors.bg} ${colors.text} ${colors.border}`
                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Offerings Grid */}
      <div className="space-y-4">
        {filtered.map((offering) => {
          const colors = CATEGORY_COLORS[offering.category] || DEFAULT_COLOR;
          const isExpanded = expandedOffering === offering.id;
          const displayName = offering.subType
            ? `${offering.category}: ${offering.subType}`
            : offering.category;

          return (
            <div key={offering.id} className="card overflow-hidden">
              {/* Offering Header */}
              <button
                onClick={() => setExpandedOffering(isExpanded ? null : offering.id)}
                className="w-full text-left p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
                      >
                        {offering.category}
                      </span>
                      {offering.entryPoint && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-slate-700">
                          Entry Point
                        </span>
                      )}
                      {offering.startingPrice && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          From {offering.startingPrice}
                        </span>
                      )}
                      {offering.caseStudies.length > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {offering.caseStudies.length} case{" "}
                          {offering.caseStudies.length === 1 ? "study" : "studies"}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {displayName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {offering.description.split("\n")[0]}
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 dark:text-slate-500 ml-3 mt-1 transition-transform flex-shrink-0 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-700 px-5 pb-5">
                  {/* Full Description */}
                  <div className="mt-4 mb-4">
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Description
                    </h4>
                    {offering.description.split("\n\n").map((para, i) => (
                      <p key={i} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                        {para}
                      </p>
                    ))}
                  </div>

                  {/* Meta Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {offering.targetIndustries.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                          Target Industries
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {offering.targetIndustries.map((ind) => (
                            <span
                              key={ind}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            >
                              {ind}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {offering.targetProfiles.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                          Ideal For
                        </h4>
                        <ul className="space-y-0.5">
                          {offering.targetProfiles.map((p, i) => (
                            <li key={i} className="text-xs text-slate-500 dark:text-slate-400">
                              &bull; {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {offering.template && (
                    <div className="mb-4">
                      <span className="text-xs text-slate-400 dark:text-slate-500">Template: </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{offering.template}</span>
                    </div>
                  )}

                  {/* Case Studies */}
                  {offering.caseStudies.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                        Case Studies
                      </h4>
                      <div className="space-y-2">
                        {offering.caseStudies.map((cs, i) => (
                          <div
                            key={i}
                            className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 border border-slate-100 dark:border-slate-700"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-[#3289FF]">
                                {cs.client}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">{cs.engagement}</p>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-300 font-medium">
                              {cs.outcome}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No solutions match your search.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveCategory(null);
            }}
            className="text-xs text-[#3289FF] hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
