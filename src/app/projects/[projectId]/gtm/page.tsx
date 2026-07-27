"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PortfolioGTM, PortfolioGTMStatus } from "@/lib/types";
import { generatePortfolioGTMPDF } from "@/lib/generate-pdf";

interface GtmResponse {
  status: PortfolioGTMStatus;
  generatedAt: string | null;
  error: string | null;
  gtm: PortfolioGTM | null;
}

const ACTIVE: PortfolioGTMStatus[] = ["queued", "running"];

export default function PortfolioGTMPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<GtmResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/gtm`);
      const json = (await res.json()) as GtmResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while a generation is in flight.
  useEffect(() => {
    const active = data && ACTIVE.includes(data.status);
    if (active && !pollRef.current) {
      pollRef.current = setInterval(fetchData, 4000);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data, fetchData]);

  const generate = async () => {
    await fetch(`/api/projects/${projectId}/gtm`, { method: "POST" });
    setData((d) => (d ? { ...d, status: "queued" } : { status: "queued", generatedAt: null, error: null, gtm: null }));
    fetchData();
  };

  const isActive = data ? ACTIVE.includes(data.status) : false;
  const gtm = data?.gtm ?? null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-[#3289FF] hover:underline">
            ← Back to project
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mt-1">Portfolio GTM</h1>
          {gtm && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
              {gtm.projectName} · {gtm.accountCount} accounts · generated {gtm.generatedDate}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {gtm && (
            <button onClick={() => generatePortfolioGTMPDF(gtm)} className="btn-ghost text-xs">
              Download PDF
            </button>
          )}
          <button onClick={generate} disabled={isActive} className="btn-primary text-xs disabled:opacity-50">
            {isActive ? "Generating…" : gtm ? "Regenerate" : "Generate rollup"}
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}

      {!loading && isActive && (
        <div className="card p-10 flex flex-col items-center justify-center text-center gap-4">
          <span className="w-9 h-9 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-[#3289FF] animate-spin" />
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {data?.status === "queued" ? "Queued…" : "Consolidating the territory…"}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
              Rolling up every researched account into one strategy — aggregating opportunity, tiering the strike list,
              and finding the shared play. This runs in the background and can take a couple of minutes; the page updates
              automatically.
            </p>
          </div>
        </div>
      )}

      {!loading && data?.status === "failed" && (
        <div className="card p-4 border-red-200 bg-red-50 dark:bg-red-900/20 mb-4">
          <p className="text-sm text-red-600 dark:text-red-300">Generation failed: {data.error || "unknown error"}</p>
        </div>
      )}

      {!loading && !gtm && !isActive && data?.status !== "failed" && (
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No rollup yet. Turn every researched account in this project into one consolidated go-to-market
            strategy — a shared thesis, a tiered strike list, and one repeatable play.
          </p>
        </div>
      )}

      {gtm && <Rollup gtm={gtm} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 mb-4">
      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Rollup({ gtm }: { gtm: PortfolioGTM }) {
  const TIER_COLOR: Record<number, string> = {
    1: "text-emerald-600 dark:text-emerald-300",
    2: "text-blue-600 dark:text-blue-300",
    3: "text-slate-500 dark:text-slate-400",
  };
  return (
    <div>
      <Section title="1. Territory thesis">
        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{gtm.thesis}</p>
      </Section>

      <Section title="2. The number">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Stat label="Est. first-year" value={gtm.theNumber.aggregateFirstYear} />
          <Stat label="Expansion potential" value={gtm.theNumber.aggregateExpansion} />
          <Stat label="Shared entry motion" value={gtm.theNumber.sharedEntryMotion || "—"} small />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{gtm.theNumber.commentary}</p>
      </Section>

      <Section title="3. The wedge & expansion path">
        {gtm.wedge.entrySolution && (
          <p className="text-sm mb-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Wedge:</span> {gtm.wedge.entrySolution}
          </p>
        )}
        {gtm.wedge.universalPain && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">
            <span className="font-semibold">Universal pain:</span> {gtm.wedge.universalPain}
          </p>
        )}
        {gtm.wedge.positioning && <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{gtm.wedge.positioning}</p>}
        <ol className="list-decimal ml-5 space-y-1">
          {gtm.wedge.expansionPath.map((s, i) => (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-700 dark:text-slate-200">{s.offering}</span> — {s.rationale}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="4. Account tiering">
        {gtm.tiers.map((tier) =>
          tier.accounts.length === 0 ? null : (
            <div key={tier.tier} className="mb-4 last:mb-0">
              <h3 className={`text-sm font-bold mb-1 ${TIER_COLOR[tier.tier]}`}>
                Tier {tier.tier} — {tier.label} ({tier.accounts.length})
              </h3>
              {tier.criteria && <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{tier.criteria}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="py-1 pr-2 font-medium">Account</th>
                      <th className="py-1 pr-2 font-medium">Score</th>
                      <th className="py-1 pr-2 font-medium">Opp</th>
                      <th className="py-1 pr-2 font-medium">Est. Y1</th>
                      <th className="py-1 font-medium">Why now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tier.accounts.map((a) => (
                      <tr key={a.slug} className="border-b border-slate-100 dark:border-slate-800 align-top">
                        <td className="py-1.5 pr-2 font-medium text-slate-700 dark:text-slate-200">{a.name}</td>
                        <td className="py-1.5 pr-2 text-slate-500">
                          {a.totalScore} ({a.rating})
                        </td>
                        <td className="py-1.5 pr-2 text-slate-500">{a.opportunityScore ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">{a.estimatedFirstYear}</td>
                        <td className="py-1.5 text-slate-600 dark:text-slate-300">{a.whyNow}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        )}
      </Section>

      <Section title="5. Segment playbooks">
        <div className="space-y-3">
          {gtm.segmentPlaybooks.map((s, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {s.segment} <span className="text-slate-400 font-normal">({s.accounts.length})</span>
              </p>
              {s.play && <p className="text-sm text-slate-600 dark:text-slate-300">{s.play}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="6. Buying-committee pattern">
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-semibold">Champion:</span> {gtm.buyingCommittee.champion}
          </li>
          <li>
            <span className="font-semibold">Economic buyer:</span> {gtm.buyingCommittee.economicBuyer}
          </li>
          <li>
            <span className="font-semibold">Strategic sign-off:</span> {gtm.buyingCommittee.signOff}
          </li>
          <li>
            <span className="font-semibold">Operational entry:</span> {gtm.buyingCommittee.operationalEntry}
          </li>
        </ul>
      </Section>

      <Section title="7. Sequenced action plan">
        <div className="space-y-3">
          {gtm.actionPlan.map((w, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {w.wave} — {w.focus}
              </p>
              <ul className="list-disc ml-5 text-sm text-slate-600 dark:text-slate-300">
                {w.actions.map((a, j) => (
                  <li key={j}>{a}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {gtm.dataQualityNotes.length > 0 && (
        <Section title="8. Data-quality notes">
          <ul className="list-disc ml-5 text-sm text-amber-700 dark:text-amber-300 space-y-1">
            {gtm.dataQualityNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`font-bold text-slate-800 dark:text-slate-100 ${small ? "text-sm" : "text-lg"}`}>{value}</p>
    </div>
  );
}
