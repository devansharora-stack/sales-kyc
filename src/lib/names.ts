// Normalize a person's name for matching across entry points (matrix rows,
// shallow researcher output, manual/CSV imports). Strips honorifics, punctuation
// and case so "Dr. Srinivas Bandi" and "srinivas bandi" match.
export function normalizeStakeholderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|prof|sir)\.?\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Capitalize the first letter of each word for display, so a manually-typed
// "ramprasad sridharan" shows as "Ramprasad Sridharan" like AI-found names.
// Only the leading letter is changed, preserving intentional caps (e.g. "McKinsey").
export function formatStakeholderName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
