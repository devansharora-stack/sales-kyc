CREATE TABLE "sales_kyc"."chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"company_slug" text,
	"context_type" text NOT NULL,
	"title" text,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "chat_sessions_context_type_check" CHECK ("sales_kyc"."chat_sessions"."context_type" IN ('company', 'project', 'global'))
);
--> statement-breakpoint
ALTER TABLE "sales_kyc"."chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "sales_kyc"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_kyc"."chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_user" ON "sales_kyc"."chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_project" ON "sales_kyc"."chat_sessions" USING btree ("project_id");