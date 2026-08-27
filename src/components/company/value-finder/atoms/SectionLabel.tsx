import type { Theme } from "../theme";

// Level-2 section heading — the strongest text below the company title. Sits
// clearly above the tiny uppercase micro-labels (SOURCE, POTENTIAL IMPACT):
// a real mixed-case heading + a quiet subtitle. Data-room: cobalt tick +
// heading. Ledger: heading over a navy underline rule.
export default function SectionLabel({
  theme,
  title,
  subtitle,
}: {
  theme: Theme;
  title: string;
  subtitle?: string;
}) {
  if (theme.variant === "ledger") {
    return (
      <div className="pb-2" style={{ borderBottom: `2px solid ${theme.navy}` }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.05, color: theme.ink }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: 11.5, color: theme.mute, marginTop: 2 }}>{subtitle}</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-1 rounded-full self-stretch" style={{ background: theme.cobalt, minHeight: 34 }} />
      <div>
        <h2 className="text-[20px] font-extrabold tracking-tight leading-none" style={{ color: theme.ink }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-[11.5px] mt-0.5" style={{ color: theme.mute }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
