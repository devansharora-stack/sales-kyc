import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { shares } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getUserByEmail } from "@/lib/access";

// Revoke a share link (owner-only). The old link stops working immediately.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { token } = await params;
  await db
    .update(shares)
    .set({ disabled: true })
    .where(and(eq(shares.token, token), eq(shares.createdBy, user.id)));

  return NextResponse.json({ success: true });
}

// Rotate a share link (owner-only): disable the old token, mint a new one for
// the same resource so old links die instantly.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { token } = await params;
  const [existing] = await db
    .select({ resourceType: shares.resourceType, resourceId: shares.resourceId })
    .from(shares)
    .where(and(eq(shares.token, token), eq(shares.createdBy, user.id), eq(shares.disabled, false)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newToken = randomBytes(24).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.update(shares).set({ disabled: true }).where(and(eq(shares.token, token), eq(shares.createdBy, user.id)));
    await tx.insert(shares).values({
      resourceType: existing.resourceType,
      resourceId: existing.resourceId,
      token: newToken,
      createdBy: user.id,
    });
  });

  return NextResponse.json({ token: newToken, url: `/shared/${newToken}` });
}
