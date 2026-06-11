// Map Drizzle rows (camelCase, Date objects) back to the snake_case + ISO-string
// shape the frontend already expects, so the DB swap stays invisible to the UI.
import type { InferSelectModel } from "drizzle-orm";
import type { projects, researchJobs, researchSteps, stakeholderProfiles } from "@/db/schema";

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

type ProjectRow = InferSelectModel<typeof projects>;
type JobRow = InferSelectModel<typeof researchJobs>;
type StepRow = InferSelectModel<typeof researchSteps>;
type StakeholderRow = InferSelectModel<typeof stakeholderProfiles>;

export function serializeProject(p: ProjectRow) {
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    description: p.description,
    status: p.status,
    company_count: p.companyCount,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
}

export function serializeStep(s: StepRow) {
  return {
    id: s.id,
    job_id: s.jobId,
    agent_name: s.agentName,
    phase: s.phase,
    status: s.status,
    output: s.output,
    error_message: s.errorMessage,
    started_at: iso(s.startedAt),
    completed_at: iso(s.completedAt),
    duration_ms: s.durationMs,
  };
}

export function serializeJob(j: JobRow, steps?: StepRow[]) {
  return {
    id: j.id,
    project_id: j.projectId,
    user_id: j.userId,
    company_name: j.companyName,
    company_context: j.companyContext,
    status: j.status,
    progress: j.progress,
    started_at: iso(j.startedAt),
    completed_at: iso(j.completedAt),
    error_message: j.errorMessage,
    created_at: iso(j.createdAt),
    ...(steps ? { research_steps: steps.map(serializeStep) } : {}),
  };
}

// `includeData` controls whether the heavy `data` jsonb (full profile) is sent.
// List views omit it; the detail view includes it.
export function serializeStakeholder(s: StakeholderRow, includeData = true) {
  return {
    id: s.id,
    project_id: s.projectId,
    company_profile_id: s.companyProfileId,
    user_id: s.userId,
    name: s.name,
    company: s.company,
    title: s.title,
    linkedin_url: s.linkedinUrl,
    url_confidence: s.urlConfidence,
    input_type: s.inputType,
    status: s.status,
    progress: s.progress,
    error_message: s.errorMessage,
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
    ...(includeData ? { data: s.data } : {}),
  };
}
