ALTER TABLE "sessions" DROP COLUMN "two_factor_verified";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "two_factor_secret";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "two_factor_enrolled_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "last_totp_counter";
