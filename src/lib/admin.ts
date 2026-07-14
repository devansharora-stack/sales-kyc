// Admin allowlist for the internal usage dashboard. Comma-separated emails in
// the ADMIN_EMAILS env var; defaults to the three owners so access is reliable
// even if the env var isn't set. Kept separate from sign-in allowlists (auth.ts).
const DEFAULT_ADMINS = [
  "devansh.arora@techolution.com",
  "nikhil.venkatesh@techolution.com",
  "keshav.sharma@techolution.com",
].join(",");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || DEFAULT_ADMINS)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
