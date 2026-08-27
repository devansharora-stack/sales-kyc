import type { CompanyDetail } from "@/lib/types";
import type { Theme } from "../theme";

// Report masthead + title block. Data-room: logo over an underline rule, then a
// title block with an intro sentence and an exec-summary left-rule. Ledger: a
// clean white cover panel (hairline border) with logo, title, meta + summary.
export default function Letterhead({
  theme,
  company,
  meta,
  execSummary,
}: {
  theme: Theme;
  company: CompanyDetail;
  meta: string;
  execSummary: string;
}) {
  if (theme.letterheadStyle === "band") {
    return (
      <div
        style={{
          background: theme.sheetBg,
          color: theme.ink,
          borderRadius: 14,
          border: `1px solid ${theme.hair}`,
          padding: "22px 24px",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/techolution-logo.svg" alt="Techolution" style={{ height: 22, width: "auto" }} />
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: theme.mute,
              textAlign: "right",
            }}
          >
            Automation Opportunity Assessment
          </div>
        </div>
        <div style={{ height: 1, background: theme.hair, marginTop: 16 }} />
        <h1 className="vf-h1" style={{ fontWeight: 800, fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 18, color: theme.ink }}>
          {company.name}
        </h1>
        <p style={{ fontSize: 11.5, color: theme.mute, marginTop: 8 }}>{meta}</p>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: "#1E293B", marginTop: 14, maxWidth: 620 }}>{execSummary}</p>
      </div>
    );
  }

  // data-room: underline masthead + title block
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1.5 border-b-2 pb-3" style={{ borderColor: theme.navy }}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/techolution-logo.svg" alt="Techolution" style={{ height: 22, width: "auto" }} />
          <div className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-slate-400 mt-1.5">
            Enterprise AI &amp; Automation
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Automation Opportunity Assessment
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Prepared for {company.name}</div>
        </div>
      </div>

      <div className="pt-3">
        <h1 className="vf-h1 text-[26px] sm:text-[30px] leading-tight sm:leading-none font-extrabold tracking-tight" style={{ color: theme.ink }}>
          {company.name}
        </h1>
        <p className="text-[12px] text-slate-500 mt-1.5">{meta}</p>
        <div className="mt-2.5 pl-3 border-l-2 max-w-[640px]" style={{ borderColor: theme.cobalt }}>
          <p className="text-[13.5px] font-semibold leading-snug" style={{ color: "#1E293B" }}>{execSummary}</p>
        </div>
      </div>
    </div>
  );
}
