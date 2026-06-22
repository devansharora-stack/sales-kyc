"use client";

import { useState } from "react";
import type {
  ScriptTone,
  StakeholderScript,
  StakeholderScriptSet,
} from "@/lib/types";

const TONE_META: Record<ScriptTone, { label: string; tab: string; accent: string }> = {
  receptive: { label: "Receptive", tab: "Open Book", accent: "emerald" },
  analytical: { label: "Analytical", tab: "Neutral Pro", accent: "sky" },
  skeptical: { label: "Skeptical", tab: "Defensive Guard", accent: "amber" },
};
const TONE_ORDER: ScriptTone[] = ["receptive", "analytical", "skeptical"];

function scriptToText(s: StakeholderScript): string {
  const lines = s.lines.map((l) => {
    if (l.speaker === "rep") return `T: ${l.text}`;
    if (l.speaker === "prospect") return `C: ${l.text}`;
    return l.text;
  });
  const obj = s.objections.length
    ? ["", "OBJECTIONS", ...s.objections.map((o) => `- ${o.objection}\n  → ${o.response}`)]
    : [];
  const lb = s.leaveBehind ? ["", `Leave-behind: ${s.leaveBehind}`] : [];
  return [`${s.toneLabel}`, s.scenario, "", ...lines, ...obj, ...lb].join("\n");
}

export default function StakeholderScriptsPanel({
  stakeholderId,
  initialScripts,
  endpoint,
}: {
  stakeholderId: string;
  initialScripts?: StakeholderScriptSet;
  endpoint?: string;
}) {
  const generateUrl = endpoint || `/api/stakeholders/${stakeholderId}/scripts`;
  const [scripts, setScripts] = useState<StakeholderScriptSet | undefined>(initialScripts);
  const [activeTone, setActiveTone] = useState<ScriptTone>(initialScripts?.predictedTone || "receptive");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(generateUrl, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to generate scripts.");
      setScripts(body.scripts);
      setActiveTone(body.scripts?.predictedTone || "receptive");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate scripts.");
    } finally {
      setLoading(false);
    }
  }

  const active = scripts?.variants.find((v) => v.tone === activeTone);

  async function copyActive() {
    if (!active) return;
    await navigator.clipboard.writeText(scriptToText(active));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Conversation Scripts</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Three persona-tuned elevator pitches for this person, built from their intel profile.
            </p>
          </div>
          {scripts && (
            <button
              onClick={generate}
              disabled={loading}
              className="btn-ghost text-sm disabled:opacity-50"
            >
              {loading ? "Regenerating…" : "Regenerate"}
            </button>
          )}
        </div>

        {/* Empty state */}
        {!scripts && (
          <div className="mt-5 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg py-10 px-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">No scripts generated yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 max-w-md mx-auto">
              We&apos;ll write three 5-minute pitch variants — receptive, analytical, and skeptical —
              for the offering that best matches this account.
            </p>
            <button onClick={generate} disabled={loading} className="btn-primary disabled:opacity-50">
              {loading ? "Generating…" : "Generate Scripts"}
            </button>
            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
          </div>
        )}

        {/* Results */}
        {scripts && (
          <div className="mt-5">
            <div className="flex items-center gap-3 flex-wrap text-xs mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-400 dark:text-slate-500">Pitching:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{scripts.offeringName}</span>
              <span className="text-slate-300 dark:text-slate-500">·</span>
              <span className="text-slate-400 dark:text-slate-500">Likely disposition:</span>
              <span className="px-2 py-0.5 rounded bg-[#3289FF]/10 text-[#1C57FF] font-semibold">
                {TONE_META[scripts.predictedTone].label}
              </span>
              {scripts.predictedToneReason && (
                <span className="text-slate-400 dark:text-slate-500 italic">— {scripts.predictedToneReason}</span>
              )}
            </div>

            {/* Tone tabs */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {TONE_ORDER.map((tone) => {
                const isActive = tone === activeTone;
                const isPredicted = tone === scripts.predictedTone;
                return (
                  <button
                    key={tone}
                    onClick={() => setActiveTone(tone)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-[#3289FF] text-white border-[#3289FF]"
                        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {TONE_META[tone].label}
                    <span className={isActive ? "text-blue-100" : "text-slate-300 dark:text-slate-500"}> · {TONE_META[tone].tab}</span>
                    {isPredicted && <span className={isActive ? "text-blue-100" : "text-[#3289FF]"}> ★</span>}
                  </button>
                );
              })}
              {error && <span className="text-xs text-red-500 self-center">{error}</span>}
            </div>

            {active && (
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic flex-1">{active.scenario}</p>
                  <button onClick={copyActive} className="btn-ghost text-xs shrink-0">
                    {copied ? "Copied ✓" : "Copy script"}
                  </button>
                </div>

                {/* Dialogue */}
                <div className="space-y-2.5">
                  {active.lines.map((l, i) => {
                    if (l.speaker === "direction") {
                      return (
                        <p key={i} className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-1">
                          {l.text}
                        </p>
                      );
                    }
                    const isRep = l.speaker === "rep";
                    return (
                      <div key={i} className="flex gap-2.5 text-sm">
                        <span
                          className={`font-bold shrink-0 w-5 ${isRep ? "text-[#3289FF]" : "text-slate-400 dark:text-slate-500"}`}
                        >
                          {isRep ? "T:" : "C:"}
                        </span>
                        <span className={isRep ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>{l.text}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Objections */}
                {active.objections.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                      Likely Objections
                    </h3>
                    <div className="space-y-3">
                      {active.objections.map((o, i) => (
                        <div key={i} className="border-l-[3px] border-amber-300 pl-3">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{o.objection}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{o.response}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leave-behind */}
                {active.leaveBehind && (
                  <div className="mt-5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Leave-behind: </span>
                    {active.leaveBehind}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
