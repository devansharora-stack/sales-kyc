import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { canReadResource } from "@/lib/access";

// GET — current rollup + generation status.
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const shareToken = new URL(request.url).searchParams.get("shareToken");

  const allowed = await canReadResource({
    email: session.user.email,
    resourceType: "project",
    resourceId: projectId,
    shareToken,
  });
  if (!allowed) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [proj] = await db
    .select({
      gtm: projects.portfolioGtm,
      status: projects.portfolioGtmStatus,
      generatedAt: projects.portfolioGtmAt,
      error: projects.portfolioGtmError,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({
    status: proj.status ?? "idle",
    generatedAt: proj.generatedAt,
    error: proj.error,
    gtm: proj.gtm ?? null,
  });
}

// POST — enqueue a (re)generation. Owner only.
export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Owner-only: the rollup spans the whole project, so require ownership.
  const [proj] = await db
    .select({ id: projects.id, status: projects.portfolioGtmStatus })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)));
  if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (proj.status === "running" || proj.status === "queued") {
    return NextResponse.json({ status: proj.status, message: "A rollup is already generating." });
  }

  await db
    .update(projects)
    .set({ portfolioGtmStatus: "queued", portfolioGtmError: null, portfolioGtmAt: new Date() })
    .where(eq(projects.id, projectId));

  await inngest.send({ name: "portfolio/gtm.start", data: { projectId } });

  return NextResponse.json({ status: "queued" });
}
