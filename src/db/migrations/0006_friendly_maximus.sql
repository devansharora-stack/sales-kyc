ALTER TABLE "sales_kyc"."llm_usage" ADD COLUMN IF NOT EXISTS "stakeholder_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_kyc"."projects" ADD COLUMN IF NOT EXISTS "portfolio_gtm" jsonb;--> statement-breakpoint
ALTER TABLE "sales_kyc"."projects" ADD COLUMN IF NOT EXISTS "portfolio_gtm_status" text DEFAULT 'idle';--> statement-breakpoint
ALTER TABLE "sales_kyc"."projects" ADD COLUMN IF NOT EXISTS "portfolio_gtm_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_kyc"."projects" ADD COLUMN IF NOT EXISTS "portfolio_gtm_error" text;
