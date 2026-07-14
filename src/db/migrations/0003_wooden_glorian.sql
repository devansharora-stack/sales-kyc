CREATE TABLE "sales_kyc"."llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"project_id" uuid,
	"company_profile_id" uuid,
	"user_id" uuid,
	"job_id" uuid,
	"agent" text,
	"phase" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_llm_usage_created" ON "sales_kyc"."llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_project" ON "sales_kyc"."llm_usage" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_company" ON "sales_kyc"."llm_usage" USING btree ("company_profile_id");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_user" ON "sales_kyc"."llm_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_llm_usage_model" ON "sales_kyc"."llm_usage" USING btree ("model");