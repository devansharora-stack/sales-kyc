import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, stakeholderProfiles } from "@/db/schema";
import { and, count, eq, desc, sql } from "drizzle-orm";
import { serializeProject } from "@/lib/serializers";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get or create user
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, session.user.email));

  if (!user) {
    return NextResponse.json({ projects: [] });
  }

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.createdAt));

  const [stakeholderStat] = await db
    .select({ value: count() })
    .from(stakeholderProfiles)
    .where(and(eq(stakeholderProfiles.userId, user.id), eq(stakeholderProfiles.status, "completed")));

  return NextResponse.json({
    projects: rows.map(serializeProject),
    stakeholdersAnalyzed: stakeholderStat?.value ?? 0,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  // Upsert user
  const [user] = await db
    .insert(users)
    .values({ email: session.user.email, name: session.user.name, image: session.user.image })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: session.user.name, image: session.user.image },
    })
    .returning({ id: users.id });

  if (!user) {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, user.id), sql`lower(${projects.name}) = lower(${name})`));

  if (existing) {
    return NextResponse.json(
      { error: "You already have a project with this name" },
      { status: 409 },
    );
  }

  let project;
  try {
    [project] = await db
      .insert(projects)
      .values({ userId: user.id, name, description: body.description || null })
      .returning();
  } catch (err) {
    // Unique index guards against a concurrent insert slipping past the check above.
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "You already have a project with this name" },
        { status: 409 },
      );
    }
    throw err;
  }

  if (!project) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }

  return NextResponse.json({ project: serializeProject(project) });
}
