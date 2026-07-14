CREATE TABLE "sales_kyc"."shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "shares_token_unique" UNIQUE("token"),
	CONSTRAINT "shares_resource_type_check" CHECK ("sales_kyc"."shares"."resource_type" IN ('project', 'company', 'stakeholder'))
);
--> statement-breakpoint
ALTER TABLE "sales_kyc"."shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "sales_kyc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shares_token" ON "sales_kyc"."shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_shares_resource" ON "sales_kyc"."shares" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_shares_created_by" ON "sales_kyc"."shares" USING btree ("created_by");