import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// x-forwarded-host is attacker-controllable. If we trusted it blindly to build
// the login redirect, an attacker could poison it and bounce a victim's sign-in
// (callbackUrl) to a look-alike host. Only honor a forwarded host that is on the
// allowlist; otherwise fall back to the canonical public URL.
const CANONICAL_URL =
  process.env.NEXTAUTH_PUBLIC_URL ||
  process.env.NEXTAUTH_URL ||
  "https://sales-kyc-693246358019.us-central1.run.app";

function canonicalHost(): string {
  try {
    return new URL(CANONICAL_URL).host;
  } catch {
    return "sales-kyc-693246358019.us-central1.run.app";
  }
}

const ALLOWED_HOSTS = new Set(
  [
    canonicalHost(),
    ...(process.env.ALLOWED_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ].filter(Boolean),
);

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });
  if (token) return NextResponse.next();

  // Behind Cloud Run, request.url is the INTERNAL container address (0.0.0.0:PORT),
  // so building the login redirect / callbackUrl from it sends users to an
  // unreachable host after sign-in. Use the public forwarded host — but only if
  // it's allow-listed, else the canonical public URL.
  const fwdHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase();
  const fwdProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "https";
  const origin = fwdHost && ALLOWED_HOSTS.has(fwdHost) ? `${fwdProto}://${fwdHost}` : CANONICAL_URL;

  const loginUrl = new URL("/login", origin);
  // Only preserve the internal path+query as callbackUrl — never a full URL, so
  // it can't be turned into an off-site redirect target.
  loginUrl.searchParams.set("callbackUrl", origin + request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!api/auth|api/inngest|api/preview|api/backup|api/crm|preview|login|_next|favicon\\.ico|.*\\.png|.*\\.svg).*)",
  ],
};
