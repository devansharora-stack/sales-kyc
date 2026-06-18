import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { researchJobs, researchSteps, companyProfiles } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { serializeJob } from "@/lib/serializers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const [job] = await db.select().from(researchJobs).where(eq(researchJobs.id, jobId));

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const steps = await db.select().from(researchSteps).where(eq(researchSteps.jobId, jobId));

  // Find the profile slug (check even before job is marked completed —
  // the profile may be saved before the job status is updated)
  const [profile] = await db
    .select({ slug: companyProfiles.slug })
    .from(companyProfiles)
    .where(eq(companyProfiles.jobId, jobId));
  const profileSlug = profile?.slug || null;

  return NextResponse.json({ job: serializeJob(job, steps), profileSlug });
}

/** Dismiss a stale/stuck research job by marking it as failed */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // Mark job as failed/dismissed
  await db
    .update(researchJobs)
    .set({
      status: "failed",
      errorMessage: "Dismissed by user",
      completedAt: new Date(),
    })
    .where(and(eq(researchJobs.id, jobId), inArray(researchJobs.status, ["queued", "running"])));

  // Also mark any pending/running steps as failed
  await db
    .update(researchSteps)
    .set({
      status: "failed",
      errorMessage: "Job dismissed",
      completedAt: new Date(),
    })
    .where(and(eq(researchSteps.jobId, jobId), inArray(researchSteps.status, ["pending", "running"])));

  return NextResponse.json({ success: true });
}
