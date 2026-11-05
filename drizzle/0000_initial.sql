CREATE TABLE "access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"applicant_name" varchar(180) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(40),
	"role" varchar(20) NOT NULL,
	"organization" varchar(180),
	"specialty" varchar(120),
	"license_number" varchar(60),
	"status" varchar(20) DEFAULT 'en attente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	CONSTRAINT "access_requests_role_check" CHECK ("access_requests"."role" in ('doctor', 'hospital')),
	CONSTRAINT "access_requests_status_check" CHECK ("access_requests"."status" in ('en attente', 'approuvé', 'refusé'))
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"doctor_id" integer NOT NULL,
	"hospital_id" integer NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"reason" text DEFAULT 'Consultation générale' NOT NULL,
	"type" varchar(60) DEFAULT 'Consultation' NOT NULL,
	"status" varchar(30) DEFAULT 'confirmé' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_status_check" CHECK ("appointments"."status" in ('confirmé', 'terminé', 'annulé'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(140) NOT NULL,
	"resource" varchar(140) NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_donations" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"hospital_id" integer,
	"status" varchar(30) DEFAULT 'planifié' NOT NULL,
	"donated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blood_donations_status_check" CHECK ("blood_donations"."status" in ('planifié', 'effectué', 'annulé'))
);
--> statement-breakpoint
CREATE TABLE "blood_stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"hospital_id" integer NOT NULL,
	"blood_group" varchar(8) NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"min_units" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blood_stocks_group_check" CHECK ("blood_stocks"."blood_group" in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
	CONSTRAINT "blood_stocks_units_check" CHECK ("blood_stocks"."units" >= 0 and "blood_stocks"."min_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "care_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"doctor_id" integer,
	"hospital_id" integer NOT NULL,
	"purpose" varchar(180) DEFAULT 'Prise en charge médicale' NOT NULL,
	"source" varchar(40) DEFAULT 'patient' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "care_consents_expiry_check" CHECK ("care_consents"."expires_at" > "care_consents"."created_at")
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"hospital_id" integer NOT NULL,
	"specialty" varchar(120) NOT NULL,
	"license_number" varchar(60) NOT NULL,
	"status" varchar(20) DEFAULT 'actif' NOT NULL,
	"years_experience" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "doctors_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "doctors_license_number_unique" UNIQUE("license_number"),
	CONSTRAINT "doctors_status_check" CHECK ("doctors"."status" in ('actif', 'suspendu', 'inactif')),
	CONSTRAINT "doctors_experience_check" CHECK ("doctors"."years_experience" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hospital_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"hospital_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"beds_total" integer DEFAULT 0 NOT NULL,
	"beds_occupied" integer DEFAULT 0 NOT NULL,
	"equipment" text DEFAULT '' NOT NULL,
	CONSTRAINT "hospital_services_beds_check" CHECK ("hospital_services"."beds_total" >= 0 and "hospital_services"."beds_occupied" >= 0 and "hospital_services"."beds_occupied" <= "hospital_services"."beds_total")
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"short_name" varchar(70) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"phone" varchar(40) NOT NULL,
	"type" varchar(80) DEFAULT 'Hôpital public' NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"beds_total" integer DEFAULT 0 NOT NULL,
	"beds_occupied" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "hospitals_beds_check" CHECK ("hospitals"."beds_total" >= 0 and "hospitals"."beds_occupied" >= 0 and "hospitals"."beds_occupied" <= "hospitals"."beds_total"),
	CONSTRAINT "hospitals_coordinates_check" CHECK ("hospitals"."latitude" between -90 and 90 and "hospitals"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "medical_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"doctor_id" integer,
	"title" varchar(180) NOT NULL,
	"category" varchar(40) DEFAULT 'analyse' NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"doctor_id" integer,
	"hospital_id" integer,
	"category" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"details" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"message" text NOT NULL,
	"category" varchar(40) DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"hospital_id" integer NOT NULL,
	"appointment_id" integer,
	"title" varchar(180) NOT NULL,
	"amount" integer NOT NULL,
	"provider" varchar(30),
	"status" varchar(30) DEFAULT 'en attente' NOT NULL,
	"reference" varchar(80),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('en attente', 'payé', 'annulé', 'remboursé'))
);
--> statement-breakpoint
CREATE TABLE "pharmacies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" text NOT NULL,
	"phone" varchar(40) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"hours" varchar(100) DEFAULT '08:00 – 20:00' NOT NULL,
	CONSTRAINT "pharmacies_coordinates_check" CHECK ("pharmacies"."latitude" between -90 and 90 and "pharmacies"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"doctor_id" integer NOT NULL,
	"hospital_id" integer NOT NULL,
	"diagnosis" text NOT NULL,
	"medications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"type" varchar(40) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(30) DEFAULT 'en attente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	CONSTRAINT "privacy_requests_type_check" CHECK ("privacy_requests"."type" in ('accès', 'rectification', 'effacement', 'opposition')),
	CONSTRAINT "privacy_requests_status_check" CHECK ("privacy_requests"."status" in ('en attente', 'en cours', 'traité', 'refusé'))
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"hospital_id" integer NOT NULL,
	"supplier" varchar(180) NOT NULL,
	"item_name" varchar(180) NOT NULL,
	"quantity" integer NOT NULL,
	"total_cost" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'commandé' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_quantity_check" CHECK ("purchase_orders"."quantity" > 0 and "purchase_orders"."total_cost" >= 0),
	CONSTRAINT "purchase_orders_status_check" CHECK ("purchase_orders"."status" in ('commandé', 'en livraison', 'reçu', 'annulé'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL,
	CONSTRAINT "rate_limits_hits_check" CHECK ("rate_limits"."hits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"two_factor_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_expiry_check" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"hospital_id" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"category" varchar(80) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 10 NOT NULL,
	"unit" varchar(30) DEFAULT 'unités' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"expiry_date" timestamp,
	CONSTRAINT "stock_quantities_check" CHECK ("stock_items"."quantity" >= 0 and "stock_items"."min_quantity" >= 0 and "stock_items"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(180) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(40),
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'patient' NOT NULL,
	"npi" varchar(40),
	"blood_group" varchar(8),
	"birth_date" varchar(20),
	"city" varchar(100) DEFAULT 'Cotonou',
	"hospital_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"privacy_accepted_at" timestamp,
	"two_factor_secret" text,
	"two_factor_enrolled_at" timestamp,
	"last_totp_counter" integer,
	"password_changed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_npi_unique" UNIQUE("npi"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('patient', 'doctor', 'hospital', 'admin')),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_blood_group_check" CHECK ("users"."blood_group" is null or "users"."blood_group" in ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-')),
	CONSTRAINT "users_professional_hospital_check" CHECK ("users"."role" not in ('doctor', 'hospital') or "users"."hospital_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_donations" ADD CONSTRAINT "blood_donations_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_donations" ADD CONSTRAINT "blood_donations_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_stocks" ADD CONSTRAINT "blood_stocks_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_consents" ADD CONSTRAINT "care_consents_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_consents" ADD CONSTRAINT "care_consents_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_consents" ADD CONSTRAINT "care_consents_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_services" ADD CONSTRAINT "hospital_services_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_request_status_idx" ON "access_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointment_patient_date_idx" ON "appointments" USING btree ("patient_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointment_doctor_date_idx" ON "appointments" USING btree ("doctor_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointment_hospital_idx" ON "appointments" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "audit_actor_date_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "consent_patient_idx" ON "care_consents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "consent_doctor_expiry_idx" ON "care_consents" USING btree ("doctor_id","expires_at");--> statement-breakpoint
CREATE INDEX "consent_hospital_expiry_idx" ON "care_consents" USING btree ("hospital_id","expires_at");--> statement-breakpoint
CREATE INDEX "doctor_hospital_idx" ON "doctors" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "medical_document_patient_idx" ON "medical_documents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "medical_record_patient_date_idx" ON "medical_records" USING btree ("patient_id","recorded_at");--> statement-breakpoint
CREATE INDEX "notification_user_date_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_patient_idx" ON "payments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "payment_hospital_idx" ON "payments" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "payment_appointment_idx" ON "payments" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "prescription_patient_date_idx" ON "prescriptions" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "privacy_request_patient_idx" ON "privacy_requests" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "privacy_request_status_idx" ON "privacy_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_hospital_idx" ON "stock_items" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_hospital_idx" ON "users" USING btree ("hospital_id");