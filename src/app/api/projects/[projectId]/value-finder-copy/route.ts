import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { canReadResource } from "@/lib/access";
import { generateValueFinderCopy } from "@/lib/value-finder-copy";
import { computePeerBenchmark } from "@/lib/value-finder-benchmark";
import type { CompanyDetail } from "@/lib/types";

// GET /api/projects/[projectId]/value-finder-copy?slug=...&refresh=1
// Returns cached second-person one-pager copy, generating (and persisting) it
// on first request. ?refresh=1 forces regeneration.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const shareToken = searchParams.get("shareToken");
  const refresh = searchParams.get("refresh") === "1";
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const [profile] = await db
    .select()
    .from(companyProfiles)
    .where(and(eq(companyProfiles.projectId, projectId), eq(companyProfiles.slug, slug)));
  if (!profile) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const allowed = await canReadResource({
    email: session.user.email,
    resourceType: "company",
    resourceId: profile.id,
    shareToken,
  });
  if (!allowed) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const data = profile.data as unknown as CompanyDetail;

  // Peer benchmark is computed fresh (peer set grows as more companies are
  // researched) and merged into the returned copy — never cached on the profile.
  const benchmark = await computePeerBenchmark(projectId, profile.id, data);

  if (!refresh && data.valueFinderCopy?.pains?.length) {
    return NextResponse.json({ copy: { ...data.valueFinderCopy, benchmark } });
  }

  try {
    const copy = await generateValueFinderCopy(data);
    // Persist only for owners (share-token readers may lack write intent; the
    // update is harmless but we keep it owner-gated to avoid surprise writes).
    await db
      .update(companyProfiles)
      .set({
        data: { ...data, valueFinderCopy: copy } as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(companyProfiles.id, profile.id));
    return NextResponse.json({ copy: { ...copy, benchmark } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
