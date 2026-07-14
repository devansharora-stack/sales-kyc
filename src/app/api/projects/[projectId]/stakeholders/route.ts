import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, projects, stakeholderProfiles } from "@/db/schema";
import { and, eq, desc, gte, isNull } from "drizzle-orm";
import { serializeStakeholder } from "@/lib/serializers";
import { inngest } from "@/lib/inngest";
import { canReadResource } from "@/lib/access";

async function getUserAndProject(email: string, projectId: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) return { user: null, project: null };
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)));
  return { user, project };
}

interface InputStakeholder {
  name?: string;
  company?: string;
  title?: string;
  linkedinUrl?: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const shareToken = new URL(request.url).searchParams.get("shareToken");

  // Owner or a whole-project share may list stakeholders (a single-stakeholder
  // share only exposes that one person via /api/stakeholders/[id]).
  const allowed = await canReadResource({
    email: session.user.email,
    resourceType: "project",
    resourceId: projectId,
    shareToken,
  });
  if (!allowed) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(stakeholderProfiles)
    .where(eq(stakeholderProfiles.projectId, projectId))
    .orderBy(desc(stakeholderProfiles.createdAt));

  return NextResponse.json({ stakeholders: rows.map((r) => serializeStakeholder(r, false)) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const { user, project } = await getUserAndProject(session.user.email, projectId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await request.json();
  const inputType: "manual" | "csv" | "company" = body.inputType === "csv" || body.inputType === "company" ? body.inputType : "manual";
  const companyProfileId: string | null = typeof body.companyProfileId === "string" ? body.companyProfileId : null;
  const rawPeople: InputStakeholder[] = Array.isArray(body.stakeholders) ? body.stakeholders : [];

  // A deep analysis re-runs the (paid) Apify scrape, so before queueing we
  // check for an existing COMPLETED profile of the same person (any project,
  // any user — shared) within the freshness window and ask before re-running.
  const CACHE_MAX_AGE_DAYS = 7;
  const forceRefresh = body.forceRefresh === true;
  const reuse = body.reuse === true;

  const people = rawPeople
    .map((p) => ({
      name: (p.name || "").trim(),
      company: (p.company || "").trim() || null,
      title: (p.title || "").trim() || null,
      linkedinUrl: (p.linkedinUrl || "").trim() || null,
    }))
    .filter((p) => p.name.length > 0 && p.name.length <= 200);

  if (people.length === 0) {
    return NextResponse.json({ error: "No valid stakeholders provided" }, { status: 400 });
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_AGE_DAYS);

  const created = [];
  const existing: { name: string; company: string | null; updated_at: Date | null }[] = [];
  for (const p of people) {
    // Look for a fresh, completed analysis of this person to reuse.
    if (!forceRefresh) {
      const companyCond = p.company
        ? eq(stakeholderProfiles.company, p.company)
        : isNull(stakeholderProfiles.company);
      const [cached] = await db
        .select()
        .from(stakeholderProfiles)
        .where(
          and(
            eq(stakeholderProfiles.name, p.name),
            companyCond,
            eq(stakeholderProfiles.status, "completed"),
            gte(stakeholderProfiles.updatedAt, cutoffDate),
          ),
        )
        .orderBy(desc(stakeholderProfiles.updatedAt))
        .limit(1);

      if (cached) {
        if (!reuse) {
          existing.push({ name: p.name, company: p.company, updated_at: cached.updatedAt });
          continue;
        }
        // User chose "Use existing" — copy the completed profile into this
        // project without re-running the scrape pipeline.
        const [row] = await db
          .insert(stakeholderProfiles)
          .values({
            projectId,
            companyProfileId,
            userId: user.id,
            name: p.name,
            company: p.company,
            title: p.title ?? cached.title,
            linkedinUrl: p.linkedinUrl ?? cached.linkedinUrl,
            urlConfidence: cached.urlConfidence,
            inputType,
            status: "completed",
            progress: 100,
            data: cached.data,
          })
          .onConflictDoUpdate({
            target: [stakeholderProfiles.projectId, stakeholderProfiles.name, stakeholderProfiles.company],
            set: {
              companyProfileId,
              title: p.title ?? cached.title,
              linkedinUrl: p.linkedinUrl ?? cached.linkedinUrl,
              urlConfidence: cached.urlConfidence,
              inputType,
              status: "completed",
              progress: 100,
              data: cached.data,
              errorMessage: null,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (row) created.push(serializeStakeholder(row, false));
        continue;
      }
    }

    const [row] = await db
      .insert(stakeholderProfiles)
      .values({
        projectId,
        companyProfileId,
        userId: user.id,
        name: p.name,
        company: p.company,
        title: p.title,
        linkedinUrl: p.linkedinUrl,
        urlConfidence: p.linkedinUrl ? "confirmed" : null,
        inputType,
        status: "queued",
        progress: 0,
      })
      .onConflictDoUpdate({
        target: [stakeholderProfiles.projectId, stakeholderProfiles.name, stakeholderProfiles.company],
        set: {
          companyProfileId,
          title: p.title,
          linkedinUrl: p.linkedinUrl,
          urlConfidence: p.linkedinUrl ? "confirmed" : null,
          inputType,
          status: "queued",
          progress: 0,
          errorMessage: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (row) {
      await inngest.send({ name: "research/stakeholder.start", data: { stakeholderId: row.id } });
      created.push(serializeStakeholder(row, false));
    }
  }

  return NextResponse.json({ stakeholders: created, count: created.length, existing });
}
