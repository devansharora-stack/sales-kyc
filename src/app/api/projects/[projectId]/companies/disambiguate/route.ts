import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findCompanyCandidates } from "@/agents/company-disambiguator";
import { runWithUsageContext } from "@/lib/usage-context";

// Stateless lookup: given a bare name, return candidate companies (name + domain
// + industry + HQ + descriptor) so the user can pick the right one before we
// spend a full research run. No DB writes.
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));

  try {
    // Attribute the Gemini lookup to this user/project so it isn't bucketed as
    // unattributed ("Local development") usage despite running in prod.
    const candidates = await runWithUsageContext(
      { userId: user?.id ?? null, projectId, agent: "company_disambiguator", phase: "company" },
      () => findCompanyCandidates(name),
    );
    return NextResponse.json({ candidates });
  } catch (err) {
    console.log(`[disambiguate] lookup failed for "${name}": ${err instanceof Error ? err.message : err}`);
    return NextResponse.json({ candidates: [] });
  }
}
