import type { Theme } from "../theme";
import type { ResolvedImpact } from "@/lib/value-finder-benchmarks";
import { stripDashes } from "../shared";

// Quantified impact for a finding: a real cited benchmark headline applied to
// the company's own real scale figure, with BOTH citations shown. Never faked —
// the parent only renders this when resolveImpact() returned non-null.
//
// Data-room: soft-tint rounded box. Ledger: left-rule column. `orientation`:
// "column" = vertical box beside/under a finding; "row" = compact full-width
// band under the fix text (fills horizontal space, lets the fix run wide).
export default function ImpactBox({
  theme,
  impact,
  orientation = "column",
}: {
  theme: Theme;
  impact: ResolvedImpact;
  orientation?: "column" | "row" | "hero";
}) {
  const cite = impact.benchmarkUrl ? (
    <a
      href={impact.benchmarkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block leading-tight"
      style={{
        fontSize: 9.5,
        color: theme.mute,
        textDecoration: "underline",
        textDecorationColor: theme.cobalt,
        textUnderlineOffset: "2px",
      }}
    >
      Benchmark: {impact.benchmarkCite}
    </a>
  ) : (
    <div className="leading-tight" style={{ fontSize: 9.5, color: theme.mute }}>
      Benchmark: {impact.benchmarkCite}
    </div>
  );

  const body = (
    <>
      <div
        className="font-bold uppercase"
        style={{ fontSize: 8, letterSpacing: "0.14em", color: theme.mute }}
      >
        Potential impact
      </div>
      <div
        className="font-extrabold leading-tight mt-0.5 text-[17px]"
        style={{ color: theme.navy }}
      >
        {impact.stat}
      </div>
      <div className="leading-snug mt-0.5" style={{ fontSize: 9.5, color: "#475569" }}>
        {impact.scope}
      </div>
      <div className="mt-1.5 pt-1.5 space-y-0.5" style={{ borderTop: `1px solid ${theme.hair}` }}>
        {cite}
        {impact.scale && (
          <div className="leading-tight" style={{ fontSize: 9.5, color: theme.mute }}>
            Your scale: {impact.scale}
            {impact.scaleSource ? ` (${stripDashes(impact.scaleSource)})` : ""}
          </div>
        )}
      </div>
    </>
  );

  if (orientation === "hero") {
    return (
      <div className="mt-2">
        <p className="font-bold uppercase" style={{ fontSize: 8.5, letterSpacing: "0.14em", color: theme.mute }}>
          Potential impact
        </p>
        <div className="flex flex-nowrap items-baseline gap-x-2 mt-0.5 min-w-0">
          <span className="font-extrabold leading-none text-[23px] shrink-0" style={{ color: theme.navy }}>
            {impact.stat}
          </span>
          <span className="truncate" style={{ fontSize: 12.5, color: "#475569" }}>{impact.scope}</span>
        </div>
        <div className="mt-1 leading-tight line-clamp-1" style={{ fontSize: 9, color: theme.mute }}>
          {impact.benchmarkUrl ? (
            <a
              href={impact.benchmarkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: theme.mute, textDecoration: "underline", textDecorationColor: theme.hair, textUnderlineOffset: "2px" }}
            >
              Benchmark: {impact.benchmarkCite}
            </a>
          ) : (
            <>Benchmark: {impact.benchmarkCite}</>
          )}
          {impact.scale && (
            <>
              {"  ·  "}Your scale: {impact.scale}
              {impact.scaleSource ? ` (${stripDashes(impact.scaleSource)})` : ""}
            </>
          )}
        </div>
      </div>
    );
  }

  if (orientation === "row") {
    return (
      <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${theme.hair}` }}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span
            className="font-bold uppercase"
            style={{ fontSize: 8.5, letterSpacing: "0.14em", color: theme.mute }}
          >
            Potential impact
          </span>
          <span className="font-extrabold leading-tight text-[18px]" style={{ color: theme.navy }}>
            {impact.stat}
          </span>
          <span style={{ fontSize: 11, color: "#475569" }}>{impact.scope}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
          {cite}
          {impact.scale && (
            <div className="leading-tight" style={{ fontSize: 9.5, color: theme.mute }}>
              Your scale: {impact.scale}
              {impact.scaleSource ? ` (${stripDashes(impact.scaleSource)})` : ""}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (theme.impactStyle === "rule") {
    return (
      <div style={{ borderLeft: `2px solid ${theme.hair}`, paddingLeft: 12 }}>{body}</div>
    );
  }
  return (
    <div
      className="flex flex-col justify-center rounded-lg px-3 py-2.5"
      style={{ border: `1px solid #F1F5F9`, background: theme.impactBg }}
    >
      {body}
    </div>
  );
}
