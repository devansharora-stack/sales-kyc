"use client";

// Standalone, print-optimized Value Finder one-pager. Rendered OUTSIDE MainLayout
// (see MainLayout.tsx) so print-to-PDF produces a clean sheet with no app chrome.
//
// Two modes of this route:
//   ?variant=dataroom | dataroom-cool  → the two-page ValueFinderReport (warm/cool
//     skin). This is the current "Outreach One-Pager". Ships its own A4 print CSS.
//   ?mode=plain|tease|full             → legacy ValueFinderView one-pager (kept for
//     back-compat). Uses the zoom-to-fit print hack.

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { CompanyDetail, ValueFinderCopy } from "@/lib/types";
import ValueFinderView from "@/components/company/ValueFinderView";
import ValueFinderReport from "@/components/company/value-finder/ValueFinderReport";
import type { Variant } from "@/components/company/value-finder/theme";

export default function ValueFinderPage() {
  const params = useParams();
  const search = useSearchParams();
  const projectId = params.projectId as string;
  const slug = params.slug as string;
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [copy, setCopy] = useState<ValueFinderCopy | undefined>(undefined);
  const [copyLoading, setCopyLoading] = useState(true);
  const [error, setError] = useState(false);

  // Report path (new) if a variant is present; else legacy mode path.
  const variantParam = search.get("variant");
  const isReport = variantParam === "dataroom" || variantParam === "dataroom-cool";
  const [variant, setVariant] = useState<Variant>(
    variantParam === "dataroom-cool" ? "dataroom-cool" : "dataroom"
  );
  const [mode, setMode] = useState<"plain" | "tease" | "full">(
    search.get("mode") === "full" ? "full" : search.get("mode") === "plain" ? "plain" : "tease"
  );

  useEffect(() => {
    if (!projectId || !slug) return;
    fetch(`/api/projects/${projectId}/companies?slug=${slug}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        const profile = data.profiles?.find((p: { slug: string }) => p.slug === slug);
        if (!profile) throw new Error("Not found");
        setCompany(profile.data || profile);
      })
      .catch(() => setError(true));
    fetch(`/api/projects/${projectId}/value-finder-copy?slug=${slug}`)
      .then((r) => (r.ok ? r.json() : { copy: undefined }))
      .then((d) => setCopy(d.copy))
      .catch(() => {})
      .finally(() => setCopyLoading(false));
  }, [projectId, slug]);

  if (error) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Company not found.</div>;
  if (!company) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:p-0">
      {/* Toolbar — hidden in print */}
      <div className="vf-toolbar max-w-[860px] mx-auto mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-sm">
          {isReport ? (
            <>
              <button
                onClick={() => setVariant("dataroom")}
                className={`px-4 py-1.5 font-medium cursor-pointer ${variant === "dataroom" ? "bg-[#3289FF] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Warm
              </button>
              <button
                onClick={() => setVariant("dataroom-cool")}
                className={`px-4 py-1.5 font-medium cursor-pointer border-l border-slate-300 ${variant === "dataroom-cool" ? "bg-[#3289FF] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Cool
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setMode("plain")}
                className={`px-4 py-1.5 font-medium cursor-pointer ${mode === "plain" ? "bg-[#3289FF] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Plain
              </button>
              <button
                onClick={() => setMode("tease")}
                className={`px-4 py-1.5 font-medium cursor-pointer border-l border-slate-300 ${mode === "tease" ? "bg-[#3289FF] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Value Finder 1 · Tease
              </button>
              <button
                onClick={() => setMode("full")}
                className={`px-4 py-1.5 font-medium cursor-pointer border-l border-slate-300 ${mode === "full" ? "bg-[#3289FF] text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                Value Finder 2 · Full
              </button>
            </>
          )}
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Save as PDF
        </button>
      </div>

      {copyLoading && (
        <div className="vf-toolbar max-w-[860px] mx-auto mb-2 text-xs text-slate-400">Generating second-person copy…</div>
      )}

      {isReport ? (
        <div className="max-w-[820px] mx-auto bg-white rounded-xl shadow-sm p-6 sm:p-8 print:shadow-none print:p-0 print:rounded-none print:max-w-none">
          <ValueFinderReport company={company} copy={copy} variant={variant} />
        </div>
      ) : (
        <div className="max-w-[860px] mx-auto bg-white rounded-xl shadow-sm p-8 print:shadow-none print:p-0 print:rounded-none">
          <ValueFinderView company={company} mode={mode} copy={copy} />
        </div>
      )}

      {/* Legacy ValueFinderView needs the zoom-to-fit hack; the report ships its
          own A4 @page CSS and must NOT be zoomed. */}
      {!isReport && (
        <style jsx global>{`
          @media print {
            .vf-toolbar { display: none !important; }
            body { background: #fff !important; }
            @page { size: A4; margin: 10mm; }
            .vf-sheet { zoom: 0.82; }
          }
        `}</style>
      )}
      {isReport && (
        <style jsx global>{`
          @media print {
            .vf-toolbar { display: none !important; }
            body { background: #fff !important; }
          }
        `}</style>
      )}
    </div>
  );
}
