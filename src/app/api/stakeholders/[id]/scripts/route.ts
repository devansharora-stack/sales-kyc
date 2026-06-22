import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, stakeholderProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveScriptOffering } from "@/lib/pick-offering";
import { writeStakeholderScripts } from "@/agents/stakeholder-script-writer";
import type { DeepStakeholderProfile, StakeholderScriptSet } from "@/lib/types";

// Generate (or regenerate) the 3 persona-tone sales scripts for one stakeholder.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [row] = await db
    .select()
    .from(stakeholderProfiles)
    .where(and(eq(stakeholderProfiles.id, id), eq(stakeholderProfiles.userId, user.id)));

  if (!row) return NextResponse.json({ error: "Stakeholder not found" }, { status: 404 });

  const data = (row.data || {}) as {
    raw?: Record<string, unknown>;
    profile?: DeepStakeholderProfile;
    scripts?: StakeholderScriptSet;
  };
  const profile = data.profile;
  if (row.status !== "completed" || !profile) {
    return NextResponse.json(
      { error: "Scripts need a completed deep-analysis profile for this stakeholder." },
      { status: 409 },
    );
  }

  let scripts: StakeholderScriptSet;
  try {
    const { offering, companyName, industry } = await resolveScriptOffering(
      row.companyProfileId,
      row.company || profile.experience?.[0]?.company || "the company",
    );
    scripts = await writeStakeholderScripts({ profile, offering, companyName, industry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Script generation failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  await db
    .update(stakeholderProfiles)
    .set({ data: { ...data, scripts }, updatedAt: new Date() })
    .where(and(eq(stakeholderProfiles.id, id), eq(stakeholderProfiles.userId, user.id)));

  return NextResponse.json({ scripts });
}
