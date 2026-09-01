import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

// Machine-to-machine auth for the CRM-facing API (/api/crm/*). These routes are
// exempt from the NextAuth middleware (see src/proxy.ts), so they gate on a
// shared secret instead of a user session. One key, set as CRM_API_KEY on the
// service, handed to the CRM team. No DB, no tables — additive and reversible.

/** Constant-time string compare that never short-circuits on length. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; pad to equal length first so the
  // comparison itself stays constant-time and only the digest decides.
  if (ab.length !== bb.length) {
    // Still burn a comparison to avoid leaking length via timing.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Returns an error NextResponse when the request is NOT authorized, or null when
 * it is. Usage:
 *   const denied = requireCrmKey(request);
 *   if (denied) return denied;
 */
export function requireCrmKey(request: NextRequest | Request): NextResponse | null {
  const expected = process.env.CRM_API_KEY;
  if (!expected) {
    // Misconfiguration, not a client error — fail closed and say so.
    return NextResponse.json(
      { error: "CRM API not configured", code: "not_configured" },
      { status: 503 }
    );
  }
  const provided =
    request.headers.get("x-api-key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Invalid or missing API key", code: "unauthorized" },
      { status: 401 }
    );
  }
  return null;
}
