import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createServerClient } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = createServerClient();

  const { data: job } = await supabase
    .from("research_jobs")
    .select("*, research_steps(*)")
    .eq("id", jobId)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // If completed, find the profile slug
  let profileSlug: string | null = null;
  if (job.status === "completed") {
    const { data: profile } = await supabase
      .from("company_profiles")
      .select("slug")
      .eq("job_id", jobId)
      .single();
    profileSlug = profile?.slug || null;
  }

  return NextResponse.json({ job, profileSlug });
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
  const supabase = createServerClient();

  // Mark job as failed/dismissed
  await supabase
    .from("research_jobs")
    .update({
      status: "failed",
      error_message: "Dismissed by user",
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["queued", "running"]);

  // Also mark any pending/running steps as failed
  await supabase
    .from("research_steps")
    .update({
      status: "failed",
      error_message: "Job dismissed",
      completed_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .in("status", ["pending", "running"]);

  return NextResponse.json({ success: true });
}
