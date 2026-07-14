import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { shares } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getUserByEmail, ownsResource, type ResourceType } from "@/lib/access";

const RESOURCE_TYPES: ResourceType[] = ["project", "company", "stakeholder"];

// Create (or return the existing) share link for a resource the caller owns.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const resourceType = body.resourceType as ResourceType;
  const resourceId = typeof body.resourceId === "string" ? body.resourceId : "";
  if (!RESOURCE_TYPES.includes(resourceType) || !resourceId) {
    return NextResponse.json({ error: "Invalid resourceType or resourceId" }, { status: 400 });
  }

  // You can only share what you own.
  if (!(await ownsResource(user.id, resourceType, resourceId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Reuse an existing active share so links are stable.
  const [existing] = await db
    .select({ token: shares.token })
    .from(shares)
    .where(
      and(
        eq(shares.resourceType, resourceType),
        eq(shares.resourceId, resourceId),
        eq(shares.createdBy, user.id),
        eq(shares.disabled, false),
      ),
    );
  if (existing) {
    return NextResponse.json({ token: existing.token, url: `/shared/${existing.token}` });
  }

  const token = randomBytes(24).toString("base64url");
  await db.insert(shares).values({ resourceType, resourceId, token, createdBy: user.id });
  return NextResponse.json({ token, url: `/shared/${token}` });
}

// List the caller's shares (optionally filtered to one resource).
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const resourceType = searchParams.get("resourceType");
  const resourceId = searchParams.get("resourceId");

  const conds = [eq(shares.createdBy, user.id), eq(shares.disabled, false)];
  if (resourceType) conds.push(eq(shares.resourceType, resourceType));
  if (resourceId) conds.push(eq(shares.resourceId, resourceId));

  const rows = await db
    .select({ token: shares.token, resourceType: shares.resourceType, resourceId: shares.resourceId, createdAt: shares.createdAt })
    .from(shares)
    .where(and(...conds))
    .orderBy(desc(shares.createdAt));

  return NextResponse.json({
    shares: rows.map((r) => ({ ...r, url: `/shared/${r.token}` })),
  });
}
