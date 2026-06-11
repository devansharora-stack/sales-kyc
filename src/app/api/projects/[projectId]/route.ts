import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProject } from "@/lib/serializers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

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
  const body = await request.json();

  // Only allow updating known columns
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name;
  if ("description" in body) patch.description = body.description;
  if (body.status === "active" || body.status === "archived") patch.status = body.status;

  const [project] = await db
    .update(projects)
    .set(patch)
    .where(eq(projects.id, projectId))
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

  await db.delete(projects).where(eq(projects.id, projectId));

  return NextResponse.json({ success: true });
}
