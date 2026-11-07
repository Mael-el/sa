ALTER TABLE "care_consents" ADD COLUMN "can_view" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "care_consents" ADD COLUMN "can_modify" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "care_consents" ADD COLUMN "can_view_documents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "care_consents" ADD COLUMN "status" varchar(20) DEFAULT 'accordé' NOT NULL;--> statement-breakpoint
ALTER TABLE "care_consents" ADD COLUMN "request_message" text;--> statement-breakpoint
ALTER TABLE "care_consents" ADD COLUMN "requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "care_consents" ADD COLUMN "decided_at" timestamp;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "updated_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_status_idx" ON "care_consents" USING btree ("patient_id","status");