import { db } from "@/lib/db";
import { users, projects } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

// CRM-triggered research needs a home: research_jobs / company_profiles hang off
// a project owned by a user. Rather than borrow a real person's project, we
// lazily get-or-create a dedicated system user + project. Purely additive — new
// rows only, nothing existing is touched — so it can't harm the app, and the
// CRM's auto-researched companies stay quarantined in their own project.

const SYSTEM_EMAIL = process.env.CRM_SYSTEM_EMAIL || "crm-system@techolution.com";
const PROJECT_NAME = "CRM Advisor (system)";

let cached: { userId: string; projectId: string } | null = null;

export async function getCrmProjectAndUser(): Promise<{ userId: string; projectId: string }> {
  if (cached) return cached;

  // System user (email is unique).
  let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, SYSTEM_EMAIL));
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: SYSTEM_EMAIL, name: "CRM Advisor" })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!user) {
      [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, SYSTEM_EMAIL));
    }
  }

  // System project (unique on user_id + lower(name)).
  let [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, user.id), sql`lower(${projects.name}) = lower(${PROJECT_NAME})`));
  if (!project) {
    [project] = await db
      .insert(projects)
      .values({ userId: user.id, name: PROJECT_NAME, description: "Auto-research triggered by the CRM persona-advisor API." })
      .onConflictDoNothing()
      .returning({ id: projects.id });
    if (!project) {
      [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, user.id), sql`lower(${projects.name}) = lower(${PROJECT_NAME})`));
    }
  }

  cached = { userId: user.id, projectId: project.id };
  return cached;
}
