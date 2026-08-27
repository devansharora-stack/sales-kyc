import type { CompanyDetail, ValueFinderCopy } from "@/lib/types";
import { getTheme, type Variant } from "./theme";
import { buildReportModel, TOP_N } from "./shared";

import SectionLabel from "./atoms/SectionLabel";
import Letterhead from "./composites/Letterhead";
import NumbersStrip from "./composites/NumbersStrip";
import MaturityCard from "./composites/MaturityCard";
import FunctionCard from "./composites/FunctionCard";
import FindingCard from "./composites/FindingCard";
import CtaBanner from "./composites/CtaBanner";
import MethodologyFooter from "./composites/MethodologyFooter";

// The assembled Value Finder report. Screen = continuous mobile-first scroll.
// Print = two intentional A4 pages: p1 overview (letterhead + numbers +
// maturity/function snapshot), p2 findings + CTA + footer. Both driven by the
// same theme tokens; nothing is invented — every figure is source-backed via
// buildReportModel + resolveImpact (impact boxes omit cleanly when unmatched).
export default function ValueFinderReport({
  company,
  copy,
  variant,
}: {
  company: CompanyDetail;
  copy?: ValueFinderCopy;
  variant: Variant;
}) {
  const theme = getTheme(variant);
  const model = buildReportModel(company, copy);
  const top = model.ranked.slice(0, TOP_N);
  const moreCount = model.ranked.length - top.length;

  return (
    <div
      className="vf-report"
      style={{ fontFamily: theme.fontFamily, color: theme.ink, background: theme.sheetBg }}
    >
      <style>{PRINT_CSS + (theme.fontImport || "")}</style>

      {/* ---- Page 1: overview ---- */}
      <section className="vf-page vf-page-1 space-y-2 sm:space-y-2">
        <Letterhead
          theme={theme}
          company={company}
          meta={model.meta}
          execSummary={model.execSummary}
        />

        <NumbersStrip theme={theme} metrics={model.backedMetrics} />

        {(model.mat || model.funcs.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {model.mat && (
              <MaturityCard theme={theme} mat={model.mat} benchmarkLine={model.benchmarkLine} />
            )}
            <FunctionCard theme={theme} funcs={model.funcs} />
          </div>
        )}
      </section>

      {/* ---- Page 2: findings + CTA + footer ---- */}
      <section className="vf-page vf-page-2 mt-4 sm:mt-5 space-y-3 sm:space-y-4">
        <SectionLabel theme={theme} title="Findings" subtitle="Every pain point we surfaced, with its source and impact" />

        <div className="space-y-2 sm:space-y-2.5">
          {top.map((item, i) => (
            <div key={i} className="vf-finding">
              <FindingCard theme={theme} index={i + 1} item={item} />
            </div>
          ))}
        </div>

        {moreCount > 0 && (
          <p className="text-[11px]" style={{ color: theme.mute }}>
            +{moreCount} further {moreCount === 1 ? "finding" : "findings"} documented in the full engagement.
          </p>
        )}

        <CtaBanner theme={theme} companyName={company.name} />
        <MethodologyFooter theme={theme} companyName={company.name} />
      </section>
    </div>
  );
}

// Print: natural continuous flow across A4 pages. No forced section break —
// content fills each page top to bottom; only whole cards / the CTA are kept
// from splitting across a page boundary. Screen inherits none of this.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff; }
  .vf-finding, .vf-cta { break-inside: avoid; }
  .vf-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
