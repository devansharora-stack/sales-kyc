import { db } from "@/lib/db";
import { users, projects, companyProfiles, stakeholderProfiles, shares } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type ResourceType = "project" | "company" | "stakeholder";

export async function getUserByEmail(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return user ?? null;
}

// Resolve a non-disabled share token to the resource it grants read access to.
export async function resolveShare(token: string | null | undefined) {
  if (!token) return null;
  const [row] = await db
    .select({ resourceType: shares.resourceType, resourceId: shares.resourceId })
    .from(shares)
    .where(and(eq(shares.token, token), eq(shares.disabled, false)));
  return row ? { resourceType: row.resourceType as ResourceType, resourceId: row.resourceId } : null;
}

// The owning project of a resource (a project owns itself). Null if not found.
async function getResourceProjectId(resourceType: ResourceType, resourceId: string): Promise<string | null> {
  if (resourceType === "project") return resourceId;
  if (resourceType === "company") {
    const [r] = await db.select({ projectId: companyProfiles.projectId }).from(companyProfiles).where(eq(companyProfiles.id, resourceId));
    return r?.projectId ?? null;
  }
  const [r] = await db.select({ projectId: stakeholderProfiles.projectId }).from(stakeholderProfiles).where(eq(stakeholderProfiles.id, resourceId));
  return r?.projectId ?? null;
}

export async function ownsResource(userId: string, resourceType: ResourceType, resourceId: string): Promise<boolean> {
  if (resourceType === "project") {
    const [r] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, resourceId), eq(projects.userId, userId)));
    return !!r;
  }
  if (resourceType === "company") {
    const [r] = await db.select({ id: companyProfiles.id }).from(companyProfiles).where(and(eq(companyProfiles.id, resourceId), eq(companyProfiles.userId, userId)));
    return !!r;
  }
  const [r] = await db.select({ id: stakeholderProfiles.id }).from(stakeholderProfiles).where(and(eq(stakeholderProfiles.id, resourceId), eq(stakeholderProfiles.userId, userId)));
  return !!r;
}

// Can `email` READ a specific resource? True if they own it, or a valid share
// token grants access — either an exact match, or a project-scoped share that
// covers a company/stakeholder inside that project. Never grants mutation.
export async function canReadResource(opts: {
  email: string | null | undefined;
  resourceType: ResourceType;
  resourceId: string;
  shareToken?: string | null;
}): Promise<boolean> {
  const { email, resourceType, resourceId, shareToken } = opts;

  if (email) {
    const user = await getUserByEmail(email);
    if (user && (await ownsResource(user.id, resourceType, resourceId))) return true;
  }

  const share = await resolveShare(shareToken);
  if (share) {
    if (share.resourceType === resourceType && share.resourceId === resourceId) return true;
    // A whole-project share covers every company/stakeholder within it.
    if (share.resourceType === "project") {
      const projectId = await getResourceProjectId(resourceType, resourceId);
      if (projectId && projectId === share.resourceId) return true;
    }
  }
  return false;
}
