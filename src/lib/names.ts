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
