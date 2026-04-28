import { NextResponse } from "next/server";
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
