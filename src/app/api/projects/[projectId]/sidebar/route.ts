import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { researchJobs, researchSteps, companyProfiles } from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";

// Backs ProgressSidebar (polled). Returns active + recently-completed jobs with
// their steps, plus a resolved slug for each completed job.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const activeRows = await db
    .select()
    .from(researchJobs)
    .where(and(eq(researchJobs.projectId, projectId), inArray(researchJobs.status, ["queued", "running", "failed"])))
    .orderBy(desc(researchJobs.createdAt))
    .limit(10);

  const completedRows = await db
    .select()
    .from(researchJobs)
    .where(and(eq(researchJobs.projectId, projectId), eq(researchJobs.status, "completed")))
    .orderBy(desc(researchJobs.completedAt))
    .limit(5);

  const allJobIds = [...activeRows, ...completedRows].map((j) => j.id);
  const stepRows = allJobIds.length
    ? await db
        .select({ id: researchSteps.id, jobId: researchSteps.jobId, agentName: researchSteps.agentName, status: researchSteps.status })
        .from(researchSteps)
        .where(inArray(researchSteps.jobId, allJobIds))
    : [];
  const stepsByJob = new Map<string, { id: string; agent_name: string; status: string }[]>();
  for (const s of stepRows) {
    const arr = stepsByJob.get(s.jobId!) || [];
    arr.push({ id: s.id, agent_name: s.agentName, status: s.status });
    stepsByJob.set(s.jobId!, arr);
  }

  const profileRows = completedRows.length
    ? await db
        .select({ jobId: companyProfiles.jobId, slug: companyProfiles.slug, projectId: companyProfiles.projectId })
        .from(companyProfiles)
        .where(inArray(companyProfiles.jobId, completedRows.map((j) => j.id)))
    : [];
  const slugByJob = new Map(profileRows.map((p) => [p.jobId, { slug: p.slug, project_id: p.projectId }]));

  const shape = (j: typeof activeRows[number]) => ({
    id: j.id,
    project_id: j.projectId,
    company_name: j.companyName,
    status: j.status,
    progress: j.progress,
    created_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    started_at: j.startedAt ? new Date(j.startedAt).toISOString() : null,
    research_steps: stepsByJob.get(j.id) || [],
  });

  return NextResponse.json({
    activeJobs: activeRows.map(shape),
    recentCompleted: completedRows.map((j) => ({
      ...shape(j),
      slug: slugByJob.get(j.id)?.slug || j.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    })),
  });
}
