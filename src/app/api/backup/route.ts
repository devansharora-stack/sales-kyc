import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Tables to back up (the isolated sales_kyc schema). Fixed allowlist — never
// interpolate untrusted input into the SQL below.
const TABLES = [
  "users",
  "projects",
  "research_jobs",
  "research_steps",
  "company_profiles",
  "stakeholder_profiles",
  "chat_sessions",
];

// Logical backup endpoint. The app runs inside GCP and can reach AlloyDB, so a
// scheduled GitHub Action (which cannot reach the DB directly) signs a request
// with NEXTAUTH_SECRET and calls this to pull a JSON dump. Restore with
// scripts/restore-from-backup.mjs. This is exempt from the login proxy
// (see src/proxy.ts) and does its own HMAC auth.
export async function GET(request: Request) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const ts = request.headers.get("x-backup-timestamp") || "";
  const sig = request.headers.get("x-backup-signature") || "";
  if (!ts || !sig) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reject stale requests (replay protection): timestamp must be within 5 min.
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) {
    return NextResponse.json({ error: "Stale request" }, { status: 401 });
  }

  // Constant-time compare of HMAC-SHA256(timestamp) keyed by NEXTAUTH_SECRET.
  const expected = crypto.createHmac("sha256", secret).update(ts).digest("hex");
  const provided = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const res = (await db.execute(sql.raw(`select * from sales_kyc."${t}"`))) as unknown as {
      rows?: unknown[];
    };
    tables[t] = res.rows ?? (res as unknown as unknown[]);
  }

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), schema: "sales_kyc", tables },
    { headers: { "Cache-Control": "no-store" } },
  );
}
