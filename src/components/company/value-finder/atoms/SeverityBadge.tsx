import type { Theme } from "../theme";

// Severity marker. Data-room: tinted rounded-full pill. Ledger: coloured dot +
// uppercase label. Colour comes from theme.severityTone.
export default function SeverityBadge({ theme, severity }: { theme: Theme; severity: string }) {
  const tone = theme.severityTone[severity] || "#64748B";

  if (theme.variant === "ledger") {
    return (
      <span
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 9.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: tone,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: tone }} />
        {severity}
      </span>
    );
  }

  return (
    <span
      className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: `${tone}14`, color: tone }}
    >
      {severity}
    </span>
  );
}
