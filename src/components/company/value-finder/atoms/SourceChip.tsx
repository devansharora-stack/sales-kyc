import type { Source } from "@/lib/types";
import type { Theme } from "../theme";
import { fmtSourceDate } from "../shared";

// A clickable source citation. Data-room: boxed pill (type · date). Ledger:
// inline underlined text. Both link out when the source has a URL.
export default function SourceChip({ theme, s }: { theme: Theme; s: Source }) {
  const date = fmtSourceDate(s.date);

  if (theme.variant === "ledger") {
    const txt = `${s.type}${date ? ` · ${date}` : ""}`;
    if (s.url) {
      return (
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          title={s.label}
          style={{
            color: theme.mute,
            textDecoration: "underline",
            textUnderlineOffset: "2px",
            textDecorationColor: theme.cobalt,
          }}
        >
          {txt}
        </a>
      );
    }
    return <span style={{ color: theme.mute }}>{txt}</span>;
  }

  // data-room: plain inline text (no pill), underlined only when it links out
  const txt = `${s.type}${date ? ` · ${date}` : ""}`;
  if (s.url) {
    return (
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        title={s.label}
        style={{
          color: theme.mute,
          textDecoration: "underline",
          textUnderlineOffset: "2px",
          textDecorationColor: theme.hair,
        }}
      >
        {txt}
      </a>
    );
  }
  return <span style={{ color: theme.mute }}>{txt}</span>;
}
