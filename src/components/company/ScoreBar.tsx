import type { ScoreBreakdown } from "@/lib/types";

const dimensions = [
  { key: "budgetSignal" as const, label: "Budget", max: 25, color: "bg-blue-500" },
  { key: "solutionFit" as const, label: "Fit", max: 25, color: "bg-emerald-500" },
  { key: "triggerRecency" as const, label: "Trigger", max: 20, color: "bg-amber-500" },
  { key: "aiMaturity" as const, label: "AI Mat.", max: 15, color: "bg-purple-500" },
  { key: "geminiAlignment" as const, label: "Gemini", max: 15, color: "bg-green-500" },
];

export default function ScoreBar({ scores, total, compact = false }: {
  scores: ScoreBreakdown;
  total: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex h-2 w-24 rounded-full overflow-hidden bg-slate-100">
          {dimensions.map((d) => {
            const pts = scores[d.key]?.points ?? 0;
            const pct = (pts / 100) * 100;
            return <div key={d.key} className={`${d.color}`} style={{ width: `${pct}%` }} />;
          })}
        </div>
        <span className="text-xs font-semibold text-slate-700">{total}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {dimensions.map((d) => {
        const dim = scores[d.key];
        if (!dim) return null;
        const pct = (dim.points / d.max) * 100;
        return (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-label w-14 shrink-0">{d.label}</span>
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${d.color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium text-slate-600 w-10 text-right">{dim.points}/{d.max}</span>
          </div>
        );
      })}
    </div>
  );
}
