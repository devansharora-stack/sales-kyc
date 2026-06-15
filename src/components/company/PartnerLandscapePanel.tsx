"use client";

import type { PartnerEntry, Source } from "@/lib/types";
import Sources from "./Sources";

export default function PartnerLandscapePanel({ partners }: { partners: PartnerEntry[] }) {
  if (!partners?.length) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        No partner landscape available. Re-run research on this company to generate it.
      </p>
    );
  }

  const seen = new Set<string>();
  const allSources: Source[] = partners
    .flatMap((p) => p.sources || [])
    .filter((s) => s?.url && !seen.has(s.url) && seen.add(s.url));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left text-label px-4 py-2.5 w-48">Partner / Vendor</th>
              <th className="text-left text-label px-4 py-2.5 w-40">Domain</th>
              <th className="text-left text-label px-4 py-2.5">What They Deliver</th>
              <th className="text-left text-label px-4 py-2.5 bg-[rgba(50,137,255,0.06)]">
                Techolution Opportunity
              </th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-3 font-semibold text-slate-800">{p.partner}</td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide">
                    {p.domain}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.whatTheyDeliver}</td>
                <td className="px-4 py-3 text-slate-700 bg-[rgba(50,137,255,0.04)] border-l-2 border-[#3289FF]/40">
                  {p.techolutionOpportunity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allSources.length > 0 && <Sources sources={allSources} />}
    </div>
  );
}
