import type { Theme } from "../theme";

// A labelled horizontal bar (function name → opportunity %). Same both variants.
export default function BarRow({ theme, label, pct }: { theme: Theme; label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="w-28 shrink-0 text-[10.5px] font-medium truncate"
        style={{ color: theme.mute }}
      >
        {label}
      </span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: theme.hair }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background:
              theme.variant === "ledger"
                ? theme.cobalt
                : `linear-gradient(90deg, ${theme.cobalt}, #6BA9FF)`,
          }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[13px] font-extrabold tabular-nums" style={{ color: theme.navy }}>
        {pct}%
      </span>
    </div>
  );
}
