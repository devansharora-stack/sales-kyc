import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { serializeProject } from "@/lib/serializers";
import { canReadResource, getUserByEmail } from "@/lib/access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const shareToken = new URL(request.url).searchParams.get("shareToken");

  const allowed = await canReadResource({
    email: session.user.email,
    resourceType: "project",
    resourceId: projectId,
    shareToken,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project: serializeProject(project) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // Only allow updating known columns
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name;
  if ("description" in body) patch.description = body.description;
  if (body.status === "active" || body.status === "archived") patch.status = body.status;

  const [project] = await db
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .returning();

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project: serializeProject(project) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, user.id)));

  return NextResponse.json({ success: true });
}
