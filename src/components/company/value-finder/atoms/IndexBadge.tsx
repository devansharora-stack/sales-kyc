import type { Theme } from "../theme";

// Finding number: plain cobalt zero-padded numeral (01, 02, …) in both
// variants — a quiet serial, not a highlighted badge.
export default function IndexBadge({ theme, n }: { theme: Theme; n: number }) {
  return (
    <div className="shrink-0 tabular-nums" style={{ fontWeight: 800, fontSize: 16, color: theme.cobalt, paddingTop: 1 }}>
      {String(n).padStart(2, "0")}
    </div>
  );
}
