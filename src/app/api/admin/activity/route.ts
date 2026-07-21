import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users, researchJobs, stakeholderProfiles, activity, projects, companyProfiles } from "@/db/schema";
import { and, desc, eq, gte, inArray, lt, sql, type SQL, type AnyColumn } from "drizzle-orm";

const TZ = "America/New_York";

const csv = (v: string | null) =>
  (v || "").split(",").map((s) => s.trim()).filter(Boolean);

interface FeedItem {
  type: "research_run" | "deep_analysis" | "opened";
  subtype?: string; // e.g. status, or project_open/company_open
  userEmail: string;
  label: string;
  at: Date | null;
}

/**
 * Unified admin activity feed: research runs + deep analyses (derived from
 * existing tables) merged with passive project/company opens (activity table).
 * ET-aware date bounds; honors user/company filters; recency-sorted.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const allTime = searchParams.get("allTime") === "1";
  const fromDay = (searchParams.get("from") || "").slice(0, 10);
  const toDay = (searchParams.get("to") || "").slice(0, 10);
  const userList = csv(searchParams.get("users"));
  const companyList = csv(searchParams.get("companies"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "150", 10) || 150));

  const dateConds = (tsCol: AnyColumn): SQL[] => {
    const c: SQL[] = [];
    if (!allTime && fromDay) c.push(gte(tsCol, sql`(${fromDay}::timestamp AT TIME ZONE ${TZ})`));
    if (!allTime && toDay) c.push(lt(tsCol, sql`((${toDay}::date + 1)::timestamp AT TIME ZONE ${TZ})`));
    return c;
  };
  const whereOf = (conds: SQL[]): SQL => (conds.length ? (and(...conds) as SQL) : sql`true`);

  // 1. Research runs.
  const jobConds = dateConds(researchJobs.createdAt);
  if (userList.length) jobConds.push(inArray(users.email, userList));
  if (companyList.length) jobConds.push(inArray(researchJobs.companyName, companyList));
  const jobRows = await db
    .select({ email: users.email, label: researchJobs.companyName, at: researchJobs.createdAt, status: researchJobs.status })
    .from(researchJobs)
    .leftJoin(users, eq(researchJobs.userId, users.id))
    .where(whereOf(jobConds))
    .orderBy(desc(researchJobs.createdAt))
    .limit(limit);

  // 2. Deep stakeholder analyses.
  const shConds = dateConds(stakeholderProfiles.createdAt);
  if (userList.length) shConds.push(inArray(users.email, userList));
  if (companyList.length) shConds.push(inArray(stakeholderProfiles.company, companyList));
  const shRows = await db
    .select({ email: users.email, name: stakeholderProfiles.name, company: stakeholderProfiles.company, at: stakeholderProfiles.createdAt })
    .from(stakeholderProfiles)
    .leftJoin(users, eq(stakeholderProfiles.userId, users.id))
    .where(whereOf(shConds))
    .orderBy(desc(stakeholderProfiles.createdAt))
    .limit(limit);

  // 3. Passive opens.
  const opConds = dateConds(activity.createdAt);
  if (userList.length) opConds.push(inArray(users.email, userList));
  if (companyList.length) opConds.push(inArray(activity.label, companyList));
  const opRows = await db
    .select({
      email: users.email,
      type: activity.type,
      // project_open didn't always store a name — resolve it from the linked
      // project/company so the feed shows the real name, not "(unknown)".
      label: sql<string>`coalesce(${activity.label}, ${projects.name}, ${companyProfiles.data}->>'name', '(unknown)')`,
      at: activity.createdAt,
    })
    .from(activity)
    .leftJoin(users, eq(activity.userId, users.id))
    .leftJoin(projects, eq(activity.projectId, projects.id))
    .leftJoin(companyProfiles, eq(activity.companyProfileId, companyProfiles.id))
    .where(whereOf(opConds))
    .orderBy(desc(activity.createdAt))
    .limit(limit);

  const items: FeedItem[] = [
    ...jobRows.map((r) => ({ type: "research_run" as const, subtype: r.status, userEmail: r.email ?? "unknown", label: r.label, at: r.at })),
    ...shRows.map((r) => ({ type: "deep_analysis" as const, userEmail: r.email ?? "unknown", label: r.company ? `${r.name} @ ${r.company}` : r.name, at: r.at })),
    ...opRows.map((r) => ({ type: "opened" as const, subtype: r.type, userEmail: r.email ?? "unknown", label: r.label ?? "(unknown)", at: r.at })),
  ]
    .filter((i) => i.at)
    .sort((a, b) => (b.at as Date).getTime() - (a.at as Date).getTime())
    .slice(0, limit);

  return NextResponse.json({ items });
}
