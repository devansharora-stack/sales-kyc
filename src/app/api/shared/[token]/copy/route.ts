import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, companyProfiles, stakeholderProfiles } from "@/db/schema";
import { and, eq, sql, count } from "drizzle-orm";
import { resolveShare, ownsResource } from "@/lib/access";

// Copy a shared resource into one of the caller's own projects. Pure DB copy —
// reuses the existing research `data`, runs no pipeline, costs no tokens.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Upsert the caller so they always have a user row to own the copy.
  const [user] = await db
    .insert(users)
    .values({ email: session.user.email, name: session.user.name, image: session.user.image })
    .onConflictDoUpdate({ target: users.email, set: { name: session.user.name, image: session.user.image } })
    .returning({ id: users.id });
  if (!user) return NextResponse.json({ error: "Failed to resolve user" }, { status: 500 });

  const { token } = await params;
  const share = await resolveShare(token);
  if (!share) return NextResponse.json({ error: "This link is invalid or has been revoked." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const targetProjectId = typeof body.targetProjectId === "string" ? body.targetProjectId : "";
  const newProjectName = typeof body.newProjectName === "string" ? body.newProjectName.trim() : "";

  // Resolve the destination project — either an existing one the caller owns,
  // or a brand-new one.
  let projectId: string;
  if (newProjectName) {
    const [dup] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, user.id), sql`lower(${projects.name}) = lower(${newProjectName})`));
    if (dup) return NextResponse.json({ error: "You already have a project with this name" }, { status: 409 });
    try {
      const [created] = await db.insert(projects).values({ userId: user.id, name: newProjectName }).returning({ id: projects.id });
      projectId = created!.id;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "You already have a project with this name" }, { status: 409 });
      }
      throw err;
    }
  } else if (targetProjectId) {
    // IDOR guard: never copy into a project the caller doesn't own.
    if (!(await ownsResource(user.id, "project", targetProjectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectId = targetProjectId;
  } else {
    return NextResponse.json({ error: "Provide targetProjectId or newProjectName" }, { status: 400 });
  }

  async function copyCompany(sourceId: string, tx: typeof db): Promise<string | null> {
    const [src] = await tx.select().from(companyProfiles).where(eq(companyProfiles.id, sourceId));
    if (!src) return null;
    const [row] = await tx
      .insert(companyProfiles)
      .values({
        projectId,
        userId: user.id,
        slug: src.slug,
        data: src.data,
        totalScore: src.totalScore,
        rating: src.rating,
        industry: src.industry,
        urgency: src.urgency,
        primarySolution: src.primarySolution,
        geminiStatus: src.geminiStatus,
      })
      .onConflictDoUpdate({
        target: [companyProfiles.projectId, companyProfiles.slug],
        set: {
          userId: user.id,
          data: src.data,
          totalScore: src.totalScore,
          rating: src.rating,
          industry: src.industry,
          urgency: src.urgency,
          primarySolution: src.primarySolution,
          geminiStatus: src.geminiStatus,
          updatedAt: new Date(),
        },
      })
      .returning({ id: companyProfiles.id });
    return row?.id ?? null;
  }

  async function copyStakeholder(sourceId: string, tx: typeof db, companyProfileId: string | null): Promise<void> {
    const [src] = await tx.select().from(stakeholderProfiles).where(eq(stakeholderProfiles.id, sourceId));
    if (!src) return;
    await tx
      .insert(stakeholderProfiles)
      .values({
        projectId,
        companyProfileId,
        userId: user.id,
        name: src.name,
        company: src.company,
        title: src.title,
        linkedinUrl: src.linkedinUrl,
        urlConfidence: src.urlConfidence,
        inputType: src.inputType,
        status: src.status,
        progress: src.progress,
        data: src.data,
      })
      .onConflictDoUpdate({
        target: [stakeholderProfiles.projectId, stakeholderProfiles.name, stakeholderProfiles.company],
        set: {
          companyProfileId,
          userId: user.id,
          title: src.title,
          linkedinUrl: src.linkedinUrl,
          urlConfidence: src.urlConfidence,
          status: src.status,
          progress: src.progress,
          data: src.data,
          errorMessage: null,
          updatedAt: new Date(),
        },
      });
  }

  let redirectTo = `/projects/${projectId}`;

  if (share.resourceType === "company") {
    const newId = await copyCompany(share.resourceId, db);
    if (!newId) return NextResponse.json({ error: "The shared company no longer exists." }, { status: 404 });
  } else if (share.resourceType === "stakeholder") {
    await copyStakeholder(share.resourceId, db, null);
    redirectTo = `/projects/${projectId}/stakeholders`;
  } else {
    // Whole project: companies first, then stakeholders with remapped FKs.
    await db.transaction(async (tx) => {
      const companies = await tx.select().from(companyProfiles).where(eq(companyProfiles.projectId, share.resourceId));
      const idMap = new Map<string, string>();
      for (const c of companies) {
        const [row] = await tx
          .insert(companyProfiles)
          .values({
            projectId, userId: user.id, slug: c.slug, data: c.data,
            totalScore: c.totalScore, rating: c.rating, industry: c.industry,
            urgency: c.urgency, primarySolution: c.primarySolution, geminiStatus: c.geminiStatus,
          })
          .onConflictDoUpdate({
            target: [companyProfiles.projectId, companyProfiles.slug],
            set: {
              userId: user.id, data: c.data, totalScore: c.totalScore, rating: c.rating,
              industry: c.industry, urgency: c.urgency, primarySolution: c.primarySolution,
              geminiStatus: c.geminiStatus, updatedAt: new Date(),
            },
          })
          .returning({ id: companyProfiles.id });
        if (row) idMap.set(c.id, row.id);
      }

      const stks = await tx.select().from(stakeholderProfiles).where(eq(stakeholderProfiles.projectId, share.resourceId));
      for (const s of stks) {
        const mappedCompany = s.companyProfileId ? idMap.get(s.companyProfileId) ?? null : null;
        await tx
          .insert(stakeholderProfiles)
          .values({
            projectId, companyProfileId: mappedCompany, userId: user.id,
            name: s.name, company: s.company, title: s.title, linkedinUrl: s.linkedinUrl,
            urlConfidence: s.urlConfidence, inputType: s.inputType, status: s.status,
            progress: s.progress, data: s.data,
          })
          .onConflictDoUpdate({
            target: [stakeholderProfiles.projectId, stakeholderProfiles.name, stakeholderProfiles.company],
            set: {
              companyProfileId: mappedCompany, userId: user.id, title: s.title,
              linkedinUrl: s.linkedinUrl, urlConfidence: s.urlConfidence, status: s.status,
              progress: s.progress, data: s.data, errorMessage: null, updatedAt: new Date(),
            },
          });
      }
    });
  }

  // Keep the destination project's company counter accurate.
  const [{ value: n }] = await db
    .select({ value: count() })
    .from(companyProfiles)
    .where(eq(companyProfiles.projectId, projectId));
  await db.update(projects).set({ companyCount: n, updatedAt: new Date() }).where(eq(projects.id, projectId));

  return NextResponse.json({ success: true, projectId, redirectTo });
}
