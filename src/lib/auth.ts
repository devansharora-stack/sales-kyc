import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || "").split(",").filter(Boolean);
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").filter(Boolean);

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
        if (ALLOWED_DOMAINS.some((domain) => email.endsWith(domain))) return true;
        if (ALLOWED_EMAILS.includes(email)) return true;
        return false;
      }
      return false;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
