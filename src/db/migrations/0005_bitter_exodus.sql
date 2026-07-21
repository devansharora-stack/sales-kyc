CREATE TABLE "sales_kyc"."activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"project_id" uuid,
	"company_profile_id" uuid,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sales_kyc"."activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_user" ON "sales_kyc"."activity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_created" ON "sales_kyc"."activity" USING btree ("created_at");