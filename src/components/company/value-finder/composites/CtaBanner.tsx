import type { Theme } from "../theme";
import { BOOK_URL } from "../shared";

// Closing call-to-action. Navy gradient panel; stacks on phone, row on sm+.
// The only interlinked element (per spec: CTA button carries the link).
export default function CtaBanner({ theme, companyName }: { theme: Theme; companyName: string }) {
  return (
    <div
      className="vf-cta rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 text-white"
      style={{
        background: `linear-gradient(135deg, ${theme.navy}, #16345C)`,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div>
        <p className="text-[15px] font-bold">We&apos;ve done our homework on {companyName}.</p>
        <p className="text-[12px] opacity-85 mt-0.5">
          Let&apos;s walk through these priorities together and map what to automate first.
        </p>
      </div>
      <a
        href={BOOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white text-center hover:opacity-90"
        style={{ background: theme.cobalt }}
      >
        Book a call →
      </a>
    </div>
  );
}
