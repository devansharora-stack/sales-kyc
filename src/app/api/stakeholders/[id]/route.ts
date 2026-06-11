import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, stakeholderProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { serializeStakeholder } from "@/lib/serializers";

// Single stakeholder incl. full profile data (detail view). Ownership-checked.
export async function GET(
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

  return NextResponse.json({ stakeholder: serializeStakeholder(row, true) });
}

// Dismiss / delete a stakeholder analysis.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await db
    .delete(stakeholderProfiles)
    .where(and(eq(stakeholderProfiles.id, id), eq(stakeholderProfiles.userId, user.id)));

  return NextResponse.json({ success: true });
}
