import { pgSchema, uuid, text, integer, jsonb, timestamp, boolean, unique, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Everything lives in the isolated `sales_kyc` schema (shared AlloyDB cluster).
export const kyc = pgSchema("sales_kyc");

export const users = kyc.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const projects = kyc.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    companyCount: integer("company_count").default(0),
    portfolioGtm: jsonb("portfolio_gtm"),
    portfolioGtmStatus: text("portfolio_gtm_status").default("idle"),
    portfolioGtmAt: timestamp("portfolio_gtm_at", { withTimezone: true }),
    portfolioGtmError: text("portfolio_gtm_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("projects_user_name_lower_key").on(t.userId, sql`lower(${t.name})`),
    index("idx_projects_user").on(t.userId),
  ],
);

export const researchJobs = kyc.table(
  "research_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    companyContext: jsonb("company_context").default({}),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_jobs_project").on(t.projectId), index("idx_jobs_status").on(t.status)],
);

export const researchSteps = kyc.table(
  "research_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => researchJobs.id, { onDelete: "cascade" }),
    agentName: text("agent_name").notNull(),
    phase: integer("phase").notNull(),
    status: text("status").notNull().default("pending"),
    output: jsonb("output"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("idx_steps_job").on(t.jobId)],
);

export const companyProfiles = kyc.table(
  "company_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => researchJobs.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    data: jsonb("data").notNull(),
    totalScore: integer("total_score"),
    rating: text("rating"),
    industry: text("industry"),
    urgency: text("urgency"),
    primarySolution: text("primary_solution"),
    geminiStatus: text("gemini_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("company_profiles_project_slug_key").on(t.projectId, t.slug),
    index("idx_profiles_project").on(t.projectId),
    index("idx_profiles_rating").on(t.rating),
  ],
);

export const stakeholderProfiles = kyc.table(
  "stakeholder_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    companyProfileId: uuid("company_profile_id").references(() => companyProfiles.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    urlConfidence: text("url_confidence"),
    inputType: text("input_type"),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").default(0),
    data: jsonb("data"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("stakeholder_profiles_project_name_company_key").on(t.projectId, t.name, t.company),
    index("idx_stakeholders_project").on(t.projectId),
    index("idx_stakeholders_company_profile").on(t.companyProfileId),
  ],
);

export const chatSessions = kyc.table(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    companySlug: text("company_slug"),
    contextType: text("context_type").notNull(),
    title: text("title"),
    messages: jsonb("messages").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("chat_sessions_context_type_check", sql`${t.contextType} IN ('company', 'project', 'global')`),
    index("idx_chat_sessions_user").on(t.userId),
    index("idx_chat_sessions_project").on(t.projectId),
  ],
);

// One row per LLM call — powers the admin token/cost usage dashboard.
// Attribution fields are nullable so a call with no context still records tokens.
export const llmUsage = kyc.table(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // "claude" | "gemini"
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    projectId: uuid("project_id"),
    companyProfileId: uuid("company_profile_id"),
    stakeholderId: uuid("stakeholder_id"),
    userId: uuid("user_id"),
    jobId: uuid("job_id"),
    agent: text("agent"),
    phase: text("phase"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_llm_usage_created").on(t.createdAt),
    index("idx_llm_usage_project").on(t.projectId),
    index("idx_llm_usage_company").on(t.companyProfileId),
    index("idx_llm_usage_user").on(t.userId),
    index("idx_llm_usage_model").on(t.model),
  ],
);

// Read-only share grants. One row per shared resource (project / company /
// stakeholder). A valid, non-disabled token grants read access to exactly that
// resource; login (Techolution domain) is still enforced by middleware, so a
// leaked link is useless to outsiders. Mutations always stay owner-only.
export const shares = kyc.table(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    token: text("token").notNull().unique(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("shares_resource_type_check", sql`${t.resourceType} IN ('project', 'company', 'stakeholder')`),
    uniqueIndex("idx_shares_token").on(t.token),
    index("idx_shares_resource").on(t.resourceType, t.resourceId),
    index("idx_shares_created_by").on(t.createdBy),
  ],
);

// Behavioral activity events for the admin usage dashboard. Only PASSIVE opens
// are logged here (project/company views); research runs and deep analyses are
// derived from research_jobs / stakeholder_profiles at read time, not re-logged.
export const activity = kyc.table(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "project_open" | "company_open" (+ export/share later)
    projectId: uuid("project_id"),
    companyProfileId: uuid("company_profile_id"),
    label: text("label"), // denormalized project/company name for cheap display
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_activity_user").on(t.userId),
    index("idx_activity_created").on(t.createdAt),
  ],
);
