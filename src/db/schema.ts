import { pgSchema, uuid, text, integer, jsonb, timestamp, unique, index } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_projects_user").on(t.userId)],
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
