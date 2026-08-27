import type { Theme } from "../theme";
import BarRow from "../atoms/BarRow";

// "Opportunity by function" — ranked function bars. Data-room: bordered white
// panel. Ledger: plain block. Renders nothing when there are no functions.
export default function FunctionCard({
  theme,
  funcs,
}: {
  theme: Theme;
  funcs: { fn: string; pct: number }[];
}) {
  if (funcs.length === 0) return null;

  const body = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: theme.mute }}>
        Opportunity by function
      </p>
      <div className="space-y-1.5">
        {funcs.map((f) => (
          <BarRow key={f.fn} theme={theme} label={f.fn} pct={f.pct} />
        ))}
      </div>
    </>
  );

  if (theme.variant === "ledger") return <div>{body}</div>;
  return (
    <div className="rounded-xl p-2 border" style={{ borderColor: theme.hair, background: theme.sheetBg }}>
      {body}
    </div>
  );
}
