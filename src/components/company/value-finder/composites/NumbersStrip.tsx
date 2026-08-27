import type { Theme } from "../theme";
import StatCell from "../atoms/StatCell";

// "Backed by the numbers" — the distinct source-backed scale figures across
// findings. Mobile: 2 cols; sm+: one row. Data-room: labelled tinted card.
// Ledger: hairline-gapped KPI band. Renders nothing when there are no metrics.
export default function NumbersStrip({
  theme,
  metrics,
}: {
  theme: Theme;
  metrics: { metric: string; src: string }[];
}) {
  if (metrics.length === 0) return null;

  if (theme.variant === "ledger") {
    return (
      <div
        className="vf-kpi grid grid-cols-2 sm:grid-cols-4"
        style={{ gap: 1, background: theme.hair, border: `1px solid ${theme.hair}`, borderRadius: 12, overflow: "hidden" }}
      >
        {metrics.map((m, i) => (
          <div key={i} style={{ background: theme.panelBg, padding: "14px 16px" }}>
            <StatCell theme={theme} metric={m.metric} src={m.src} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.hair, background: theme.panelBg }}>
      <div className="px-4 pt-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.mute }}>
        Backed by the numbers
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200">
        {metrics.map((m, i) => (
          <div key={i} className="px-4 py-1.5">
            <StatCell theme={theme} metric={m.metric} src={m.src} />
          </div>
        ))}
      </div>
    </div>
  );
}
