import type { Theme } from "../theme";
import { VF_DISCLAIMER } from "../shared";

// Disclaimer + methodology note. Same content both variants; theme colours only.
export default function MethodologyFooter({ theme, companyName }: { theme: Theme; companyName: string }) {
  return (
    <div className="pt-2.5 border-t" style={{ borderColor: theme.hair }}>
      <p className="text-[9.5px] leading-snug italic mb-1" style={{ color: theme.mute }}>
        {VF_DISCLAIMER}
      </p>
      <p className="text-[9.5px] leading-snug" style={{ color: theme.mute }}>
        <span className="font-semibold" style={{ color: "#475569" }}>Methodology.</span> Findings are drawn only from{" "}
        {companyName}&apos;s public filings, disclosures, press releases, job postings and reputable industry reporting,
        cited per finding above. Figures are reproduced from those sources; where none is stated, none is shown.
        Severity reflects operational and financial exposure. Prepared by Techolution, Enterprise AI &amp; Automation.
      </p>
    </div>
  );
}
