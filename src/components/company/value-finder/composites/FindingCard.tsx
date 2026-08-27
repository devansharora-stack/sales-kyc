import type { Theme } from "../theme";
import { capText, stripDashes, type EnrichedPain } from "../shared";
import { resolveImpact } from "@/lib/value-finder-benchmarks";
import IndexBadge from "../atoms/IndexBadge";
import SeverityBadge from "../atoms/SeverityBadge";
import SourceChip from "../atoms/SourceChip";
import ImpactBox from "../atoms/ImpactBox";

// One finding. Mobile-first: text column and impact stack vertically on phones
// (`flex-col`), sit side by side from `sm:` up (desktop + A4 print, which is
// ~730px wide — above the 640px breakpoint). Data-room = boxed card with a
// severity stripe; ledger = ruled row with a big numeral. Impact box only shows
// when a benchmark category matched (resolveImpact non-null) — never faked.
export default function FindingCard({
  theme,
  index,
  item,
}: {
  theme: Theme;
  index: number; // 1-based
  item: EnrichedPain;
}) {
  const p = item.pain;
  const c = item.copy;
  const title = stripDashes(c?.title || p.title);
  const problem = capText(c?.problem || p.description, 2, 220);
  const solution = capText(c?.solution || item.mapping?.value || "", 2, 220);
  const offering = item.mapping?.solutionName?.trim() || "";
  const impact = resolveImpact(c);
  const sources = (p.sources || []).slice(0, 3);
  const tone = theme.severityTone[p.severity] || "#64748B";
  const isCard = theme.findingStyle === "card";

  const outer: React.CSSProperties = isCard
    ? {
        position: "relative",
        borderRadius: 8,
        border: `1px solid ${theme.hair}`,
        background: theme.sheetBg,
        overflow: "hidden",
        // Consistency floor: keeps card rhythm uniform across companies even
        // when a finding lacks an impact match or sources (graceful omission
        // would otherwise shrink the card). Clamps bound the tall side.
        minHeight: 230,
        ...(theme.cardShadow ? { boxShadow: theme.cardShadow } : {}),
      }
    : { borderBottom: `1px solid ${theme.hair}` };

  return (
    <div className="vf-card" style={outer}>
      {isCard && (
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: tone }} />
      )}
      <div className={`${isCard ? "pl-4 pr-4 py-2" : "py-4"}`}>
        {/* Full-width text column; impact sits as a band beneath it */}
        <div className="flex items-start gap-3 min-w-0">
          <IndexBadge theme={theme} n={index} />
          <div className="min-w-0 flex-1">
            {/* L1 — the pain, the loudest line in the block */}
            <div className="flex items-start justify-between gap-2">
              <p
                className={`font-bold leading-snug line-clamp-2 ${isCard ? "text-[16.5px] sm:text-[16px]" : "text-[17px] sm:text-[16px]"}`}
                style={{ color: theme.ink, letterSpacing: "-0.01em" }}
              >
                {title}
              </p>
              <SeverityBadge theme={theme} severity={p.severity} />
            </div>

            {/* L4 — problem: quiet body, sets up the fix */}
            <p
              className="text-[13.5px] sm:text-[13px] leading-snug mt-1 line-clamp-2"
              style={{ color: "#64748B" }}
            >
              {problem}
            </p>

            {/* L3 — the fix: shaded sub-block (cream/grey) so it stands out */}
            {solution && (
              <div
                className={theme.fixBg ? "mt-2 rounded-md px-3 py-1.5" : "mt-2"}
                style={
                  theme.fixBg
                    ? { background: theme.fixBg, border: `1px solid ${theme.fixBorder}` }
                    : undefined
                }
              >
                {offering && (
                  <p className="text-[15px] font-extrabold leading-snug line-clamp-1" style={{ color: theme.ink }}>
                    <span className="font-bold" style={{ color: theme.cobalt }}>Techolution fix: </span>
                    {offering}
                  </p>
                )}
                <p className="text-[13.5px] sm:text-[13px] leading-snug mt-0.5 line-clamp-2" style={{ color: "#334155" }}>
                  {solution}
                </p>
              </div>
            )}

            {/* L2 — impact: the hero number, the payoff of the finding */}
            {impact && <ImpactBox theme={theme} impact={impact} orientation="hero" />}

            {/* L5 — source: the quietest line, a plain footnote */}
            {sources.length > 0 && (
              <div className="mt-3.5 text-[10px] line-clamp-1" style={{ color: theme.mute }}>
                <span className="font-semibold uppercase tracking-[0.1em]">Source: </span>
                {sources.map((s, j) => (
                  <span key={j}>
                    {j > 0 && <span>{"  ·  "}</span>}
                    <SourceChip theme={theme} s={s} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
