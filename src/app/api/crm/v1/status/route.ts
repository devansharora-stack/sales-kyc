import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { researchJobs, researchSteps, companyProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireCrmKey } from "@/lib/crm-auth";
import { serializeJob } from "@/lib/serializers";

/**
 * GET /api/crm/v1/status?jobId=
 * Poll a research job kicked off by /lookup. When done, `profileSlug` is set and
 * the CRM can fetch /company or /prep.
 */
export async function GET(request: NextRequest) {
  const denied = requireCrmKey(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "Provide 'jobId'" }, { status: 400 });
  }

  const [job] = await db.select().from(researchJobs).where(eq(researchJobs.id, jobId));
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const steps = await db.select().from(researchSteps).where(eq(researchSteps.jobId, jobId));

  // The profile may be written just before the job flips to completed.
  const [profile] = await db
    .select({ slug: companyProfiles.slug })
    .from(companyProfiles)
    .where(eq(companyProfiles.jobId, jobId));

  return NextResponse.json({
    job: serializeJob(job, steps),
    profileSlug: profile?.slug || null,
    done: job.status === "completed",
  });
}
