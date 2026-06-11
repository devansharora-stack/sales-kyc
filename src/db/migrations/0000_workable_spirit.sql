CREATE SCHEMA IF NOT EXISTS "sales_kyc";
--> statement-breakpoint
CREATE TABLE "sales_kyc"."company_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"project_id" uuid,
	"user_id" uuid,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"total_score" integer,
	"rating" text,
	"industry" text,
	"urgency" text,
	"primary_solution" text,
	"gemini_status" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "company_profiles_project_slug_key" UNIQUE("project_id","slug")
);
--> statement-breakpoint
CREATE TABLE "sales_kyc"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"company_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_kyc"."research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"company_name" text NOT NULL,
	"company_context" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_kyc"."research_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"agent_name" text NOT NULL,
	"phase" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "sales_kyc"."stakeholder_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"company_profile_id" uuid,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"title" text,
	"linkedin_url" text,
	"url_confidence" text,
	"input_type" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0,
	"data" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "stakeholder_profiles_project_name_company_key" UNIQUE("project_id","name","company")
);
--> statement-breakpoint
CREATE TABLE "sales_kyc"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "sales_kyc"."company_profiles" ADD CONSTRAINT "company_profiles_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "sales_kyc"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."company_profiles" ADD CONSTRAINT "company_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "sales_kyc"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."company_profiles" ADD CONSTRAINT "company_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."research_jobs" ADD CONSTRAINT "research_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "sales_kyc"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."research_jobs" ADD CONSTRAINT "research_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."research_steps" ADD CONSTRAINT "research_steps_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "sales_kyc"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."stakeholder_profiles" ADD CONSTRAINT "stakeholder_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "sales_kyc"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."stakeholder_profiles" ADD CONSTRAINT "stakeholder_profiles_company_profile_id_company_profiles_id_fk" FOREIGN KEY ("company_profile_id") REFERENCES "sales_kyc"."company_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."stakeholder_profiles" ADD CONSTRAINT "stakeholder_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_profiles_project" ON "sales_kyc"."company_profiles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_profiles_rating" ON "sales_kyc"."company_profiles" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "idx_projects_user" ON "sales_kyc"."projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_project" ON "sales_kyc"."research_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "sales_kyc"."research_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_steps_job" ON "sales_kyc"."research_steps" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_stakeholders_project" ON "sales_kyc"."stakeholder_profiles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_stakeholders_company_profile" ON "sales_kyc"."stakeholder_profiles" USING btree ("company_profile_id");