import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isAdmin } from "@/lib/admin";

// In production, never let NEXTAUTH_URL be a localhost/internal address — that
// makes Google OAuth redirect users back to localhost after sign-in. Force the
// public deployed URL (overridable via NEXTAUTH_PUBLIC_URL). Remove once the
// Cloud Run service sets NEXTAUTH_URL correctly.
const PUBLIC_URL =
  process.env.NEXTAUTH_PUBLIC_URL || "https://sales-kyc-693246358019.us-central1.run.app";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.NEXTAUTH_URL ||
    process.env.NEXTAUTH_URL.includes("localhost") ||
    process.env.NEXTAUTH_URL.includes("0.0.0.0"))
) {
  process.env.NEXTAUTH_URL = PUBLIC_URL;
}

// Normalize to bare, lowercased domains ("@techolution.com" → "techolution.com")
// so the sign-in check can compare the email's domain part EXACTLY. An
// unanchored endsWith() would let lookalike domains (e.g. "eviltecholution.com")
// or subdomains slip through if the env were ever set without the leading "@".
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || "")
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = profile?.email?.toLowerCase();
        if (!email) return false;
        const domain = email.split("@")[1];
        if (domain && ALLOWED_DOMAINS.includes(domain)) return true;
        if (ALLOWED_EMAILS.includes(email)) return true;
        return false;
      }
      return false;
    },
    async session({ session }) {
      if (session.user) {
        (session.user as { isAdmin?: boolean }).isAdmin = isAdmin(session.user.email);
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
