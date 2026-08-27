import type { Theme } from "../theme";
import { stripDashes } from "../shared";

// One source-backed number. Splits the figure from its trailing noun so the
// number dominates and the descriptor recedes — e.g. "$226M" big, "net losses"
// small ("250" big, "specialists" small). Only splits when a leading numeric
// token exists; otherwise the whole string renders as the figure.
export default function StatCell({ theme, metric, src }: { theme: Theme; metric: string; src?: string }) {
  const m = metric.trim();
  const sp = m.indexOf(" ");
  const head = sp === -1 ? m : m.slice(0, sp);
  const tail = sp === -1 ? "" : m.slice(sp + 1);
  const split = tail && /\d/.test(head);

  return (
    <div className="min-w-0">
      <div className="leading-none">
        <span
          className="font-extrabold text-[17px] sm:text-[18px] align-baseline"
          style={{ color: theme.navy }}
        >
          {split ? head : m}
        </span>
        {split && (
          <span
            className="ml-1 text-[11px] font-medium align-baseline"
            style={{ color: theme.mute }}
          >
            {tail}
          </span>
        )}
      </div>
      {src && (
        <div className="mt-1 leading-tight text-[9px]" style={{ color: theme.mute }}>
          per {stripDashes(src)}
        </div>
      )}
    </div>
  );
}
