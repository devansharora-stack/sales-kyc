import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, stakeholderProfiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { serializeStakeholder } from "@/lib/serializers";

// Global aggregate — all stakeholders owned by the signed-in user.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ stakeholders: [] });

  const rows = await db
    .select()
    .from(stakeholderProfiles)
    .where(eq(stakeholderProfiles.userId, user.id))
    .orderBy(desc(stakeholderProfiles.createdAt));

  return NextResponse.json({ stakeholders: rows.map((r) => serializeStakeholder(r, false)) });
}
