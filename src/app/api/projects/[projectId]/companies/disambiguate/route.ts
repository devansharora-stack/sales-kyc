import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findCompanyCandidates } from "@/agents/company-disambiguator";

// Stateless lookup: given a bare name, return candidate companies (name + domain
// + industry + HQ + descriptor) so the user can pick the right one before we
// spend a full research run. No DB writes.
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await params;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  try {
    const candidates = await findCompanyCandidates(name);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.log(`[disambiguate] lookup failed for "${name}": ${err instanceof Error ? err.message : err}`);
    return NextResponse.json({ candidates: [] });
  }
}
