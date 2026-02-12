-- Add new cadence columns (keep old columns for backward compatibility)
ALTER TABLE "budgets" ADD COLUMN "cadence_unit" varchar(10);--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "cadence_count" integer;--> statement-breakpoint

-- Backfill new columns from old columns
UPDATE "budgets" SET "cadence_unit" = 'month', "cadence_count" = 1 WHERE "target_cadence" = 'monthly';--> statement-breakpoint
UPDATE "budgets" SET "cadence_unit" = 'year', "cadence_count" = 1 WHERE "target_cadence" = 'yearly';--> statement-breakpoint
UPDATE "budgets" SET "cadence_unit" = 'month', "cadence_count" = "target_cadence_months" WHERE "target_cadence" = 'custom';
