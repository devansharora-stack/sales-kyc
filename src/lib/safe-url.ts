// Sanitize any URL that originates from LLM output, scraped pages, or user
// input before it lands in an <a href>. React does NOT block "javascript:" /
// "data:" / "vbscript:" hrefs, so an attacker-controlled source URL could run
// script on click. Allow only http(s) and mailto; anything else becomes a inert
// "#". Relative/anchor links are left as-is (they can't carry a scheme payload).
export function safeHref(url: unknown): string {
  if (typeof url !== "string") return "#";
  const trimmed = url.trim();
  if (!trimmed) return "#";
  // Relative, root-relative, protocol-relative, or anchor — no scheme to abuse.
  if (/^(\/|#|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const scheme = parsed.protocol.toLowerCase();
    if (scheme === "http:" || scheme === "https:" || scheme === "mailto:") {
      return parsed.href;
    }
    return "#";
  } catch {
    // Not an absolute URL and not a recognized relative form — treat as unsafe.
    return "#";
  }
}
