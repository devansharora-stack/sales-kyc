// Design tokens per report variant. Atoms read these instead of hard-coding
// colours/fonts, so the same atom renders correctly in either design. Where two
// designs are structurally different (impact box vs left-rule, boxed card vs
// ruled row) the atom branches on `presentation` flags below.

export type Variant = "dataroom" | "dataroom-cool" | "ledger";

export interface Theme {
  variant: Variant;
  // Palette
  cobalt: string;
  navy: string;
  ink: string;
  mute: string;
  hair: string; // hairline / border
  canvasBg: string; // outer page canvas behind the sheet (screen depth)
  sheetBg: string;
  panelBg: string; // soft-tint panels (numbers strip, maturity card)
  impactBg: string;
  fixBg: string; // Techolution fix sub-block fill (cream / grey) — "" = none
  fixBorder: string; // fix sub-block border
  cardShadow: string; // finding-card drop shadow css — "" = none (borders only)
  // Typography
  fontFamily: string;
  fontImport?: string; // @import css for a webfont (ledger)
  // Per-atom presentation switches
  impactStyle: "box" | "rule";
  findingStyle: "card" | "row";
  letterheadStyle: "underline" | "band";
  // Severity dot/label colours (shared hues, referenced by SeverityBadge)
  severityTone: Record<string, string>;
}

const SEVERITY_TONE: Record<string, string> = {
  Critical: "#DC2626",
  High: "#EA580C",
  Medium: "#CA8A04",
};

const COBALT = "#3289FF";
const NAVY = "#0B1F3A";

export const THEMES: Record<Variant, Theme> = {
  // V1 — warm skin: cream fix blocks, soft card shadow, warm tint canvas.
  dataroom: {
    variant: "dataroom",
    cobalt: COBALT,
    navy: NAVY,
    ink: "#0F172A",
    mute: "#64748B",
    hair: "#E7E2D8",
    canvasBg: "#F2EEE6",
    sheetBg: "#FFFFFF",
    panelBg: "#FAF8F3",
    impactBg: "#FAF8F3",
    fixBg: "#FBF8F2",
    fixBorder: "#ECE4D4",
    cardShadow: "0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.04)",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    impactStyle: "box",
    findingStyle: "card",
    letterheadStyle: "underline",
    severityTone: SEVERITY_TONE,
  },
  // V2 — cool skin: grey/cobalt fix blocks, crisp borders (no shadow), cool canvas.
  "dataroom-cool": {
    variant: "dataroom-cool",
    cobalt: COBALT,
    navy: NAVY,
    ink: "#0F172A",
    mute: "#64748B",
    hair: "#E2E8F0",
    canvasBg: "#EDF1F7",
    sheetBg: "#FFFFFF",
    panelBg: "#F5F8FF",
    impactBg: "#F5F8FF",
    fixBg: "#F4F7FB",
    fixBorder: "#DDE6F2",
    cardShadow: "",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    impactStyle: "box",
    findingStyle: "card",
    letterheadStyle: "underline",
    severityTone: SEVERITY_TONE,
  },
  ledger: {
    variant: "ledger",
    cobalt: COBALT,
    navy: NAVY,
    ink: "#0F172A",
    mute: "#64748B",
    hair: "#E2E8F0",
    // Ledger is a clean all-white paper look — no tinted panels.
    canvasBg: "#F1F5F9",
    sheetBg: "#FFFFFF",
    panelBg: "#FFFFFF",
    impactBg: "#FFFFFF",
    fixBg: "",
    fixBorder: "#E2E8F0",
    cardShadow: "",
    fontFamily: "'Manrope', system-ui, sans-serif",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');",
    impactStyle: "rule",
    findingStyle: "row",
    letterheadStyle: "band",
    severityTone: SEVERITY_TONE,
  },
};

export function getTheme(v: Variant): Theme {
  return THEMES[v];
}
