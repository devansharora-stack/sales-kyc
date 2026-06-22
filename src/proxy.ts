import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });
  if (token) return NextResponse.next();

  // Behind Cloud Run, request.url is the INTERNAL container address (0.0.0.0:PORT),
  // so building the login redirect / callbackUrl from it sends users to an
  // unreachable host after sign-in. Use the public forwarded host instead.
  const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "https";
  const origin = fwdHost ? `${fwdProto}://${fwdHost}` : request.nextUrl.origin;

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("callbackUrl", origin + request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!api/auth|api/inngest|api/preview|api/backup|preview|login|_next|favicon\\.ico|.*\\.png|.*\\.svg).*)",
  ],
};
