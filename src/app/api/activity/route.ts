import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, researchJobs, stakeholderProfiles, activity } from "@/db/schema";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";

const ALLOWED_ACTIVITY_TYPES = new Set(["project_open", "company_open"]);

/**
 * Record a passive activity event (project/company open) for the signed-in
 * user — behavioral telemetry for the admin usage dashboard. Best-effort; a
 * user can only record their own activity, and failures never surface.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const type = typeof body.type === "string" ? body.type : "";
  if (!ALLOWED_ACTIVITY_TYPES.has(type)) {
    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  }

  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, session.user.email))
      .limit(1);
    if (user) {
      await db.insert(activity).values({
        userId: user.id,
        type,
        projectId: typeof body.projectId === "string" ? body.projectId : null,
        companyProfileId: typeof body.companyProfileId === "string" ? body.companyProfileId : null,
        label: typeof body.label === "string" ? body.label.slice(0, 200) : null,
      });
    }
  } catch (e) {
    console.log(`[activity] failed to record: ${e instanceof Error ? e.message : e}`);
  }

  return NextResponse.json({ ok: true });
}

// In-progress status sets.
const COMPANY_ACTIVE = ["queued", "running"] as const;
const STAKEHOLDER_ACTIVE = ["queued", "resolving", "scraping", "synthesizing"] as const;

// Recently-done window: items finished within the last ~2 minutes.
const RECENT_WINDOW_MS = 2 * 60 * 1000;
// Staleness guards: a real run finishes in minutes. Anything still "active"
// beyond these windows (or a job left at progress 100 because its final
// status update was interrupted) is a zombie and must not show as in-progress.
const COMPANY_STALE_MS = 2 * 60 * 60 * 1000; // 2h
const STAKEHOLDER_STALE_MS = 60 * 60 * 1000; // 1h

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, session.user.email));

  if (!user) {
    return NextResponse.json({ active: [], recentlyDone: [] });
  }

  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const companyStaleCutoff = new Date(Date.now() - COMPANY_STALE_MS);
  const stakeholderStaleCutoff = new Date(Date.now() - STAKEHOLDER_STALE_MS);

  // research_jobs: genuinely active (queued/running, progress < 100, started
  // recently) OR recently completed.
  const jobRows = await db
    .select({
      id: researchJobs.id,
      companyName: researchJobs.companyName,
      status: researchJobs.status,
      projectId: researchJobs.projectId,
      completedAt: researchJobs.completedAt,
    })
    .from(researchJobs)
    .where(
      and(
        eq(researchJobs.userId, user.id),
        or(
          and(
            inArray(researchJobs.status, [...COMPANY_ACTIVE]),
            lt(researchJobs.progress, 100),
            gte(researchJobs.createdAt, companyStaleCutoff),
          ),
          gte(researchJobs.completedAt, since),
        ),
      ),
    );

  // stakeholder_profiles: active OR recently updated (used as completion proxy).
  const stakeholderRows = await db
    .select({
      id: stakeholderProfiles.id,
      name: stakeholderProfiles.name,
      status: stakeholderProfiles.status,
      projectId: stakeholderProfiles.projectId,
      updatedAt: stakeholderProfiles.updatedAt,
    })
    .from(stakeholderProfiles)
    .where(
      and(
        eq(stakeholderProfiles.userId, user.id),
        or(
          and(
            inArray(stakeholderProfiles.status, [...STAKEHOLDER_ACTIVE]),
            gte(stakeholderProfiles.updatedAt, stakeholderStaleCutoff),
          ),
          gte(stakeholderProfiles.updatedAt, since),
        ),
      ),
    );

  const active: Array<Record<string, unknown>> = [];
  const recentlyDone: Array<Record<string, unknown>> = [];

  for (const j of jobRows) {
    if ((COMPANY_ACTIVE as readonly string[]).includes(j.status)) {
      active.push({
        type: "company",
        id: j.id,
        companyName: j.companyName,
        status: j.status,
        projectId: j.projectId,
      });
    } else if (j.completedAt && j.completedAt >= since) {
      recentlyDone.push({
        type: "company",
        id: j.id,
        companyName: j.companyName,
        status: j.status,
        projectId: j.projectId,
      });
    }
  }

  for (const s of stakeholderRows) {
    if ((STAKEHOLDER_ACTIVE as readonly string[]).includes(s.status)) {
      active.push({
        type: "stakeholder",
        id: s.id,
        name: s.name,
        status: s.status,
        projectId: s.projectId,
      });
    } else if (s.updatedAt && s.updatedAt >= since) {
      recentlyDone.push({
        type: "stakeholder",
        id: s.id,
        name: s.name,
        status: s.status,
        projectId: s.projectId,
      });
    }
  }

  return NextResponse.json({ active, recentlyDone });
}
