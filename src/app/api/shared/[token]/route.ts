import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyProfiles, stakeholderProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveShare } from "@/lib/access";

// Resolve a share token to the resource it points at, plus the fields the
// read-only client needs to fetch it via the widened read routes. Login is
// enforced by middleware, so only Techolution users reach this.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const share = await resolveShare(token);
  if (!share) return NextResponse.json({ error: "This link is invalid or has been revoked." }, { status: 404 });

  if (share.resourceType === "project") {
    return NextResponse.json({ resourceType: "project", resourceId: share.resourceId, projectId: share.resourceId });
  }

  if (share.resourceType === "company") {
    const [c] = await db
      .select({ projectId: companyProfiles.projectId, slug: companyProfiles.slug })
      .from(companyProfiles)
      .where(eq(companyProfiles.id, share.resourceId));
    if (!c) return NextResponse.json({ error: "The shared company no longer exists." }, { status: 404 });
    return NextResponse.json({ resourceType: "company", resourceId: share.resourceId, projectId: c.projectId, slug: c.slug });
  }

  const [s] = await db
    .select({ projectId: stakeholderProfiles.projectId, name: stakeholderProfiles.name })
    .from(stakeholderProfiles)
    .where(eq(stakeholderProfiles.id, share.resourceId));
  if (!s) return NextResponse.json({ error: "The shared stakeholder no longer exists." }, { status: 404 });
  return NextResponse.json({ resourceType: "stakeholder", resourceId: share.resourceId, projectId: s.projectId, name: s.name });
}
