CREATE TABLE "health_facility_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" varchar(100) NOT NULL,
	"name" varchar(180),
	"kind" varchar(30) NOT NULL,
	"category" varchar(60) NOT NULL,
	"city" varchar(100),
	"locality" varchar(100),
	"address" text,
	"phone" varchar(40),
	"opening_hours" varchar(180),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source_name" varchar(100) NOT NULL,
	"source_url" text NOT NULL,
	"source_license" varchar(100) NOT NULL,
	"source_snapshot_date" date NOT NULL,
	"source_retrieved_at" timestamp DEFAULT now() NOT NULL,
	"source_properties" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "health_facility_kind_check" CHECK ("health_facility_listings"."kind" in ('facility', 'pharmacy')),
	CONSTRAINT "health_facility_coordinates_check" CHECK ("health_facility_listings"."latitude" between -90 and 90 and "health_facility_listings"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "health_facility_source_id_idx" ON "health_facility_listings" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "health_facility_kind_locality_idx" ON "health_facility_listings" USING btree ("kind","locality");
