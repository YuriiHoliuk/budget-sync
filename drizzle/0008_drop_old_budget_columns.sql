-- Phase 2: Drop old budget columns
-- Prerequisites: Phase 1 migrations (0004-0007) have been applied and verified
-- This migration removes deprecated columns that have been replaced by the new cadence system

-- Drop the old type column (behavior is now derived from settings)
ALTER TABLE "budgets" DROP COLUMN "type";

-- Drop the old cadence columns (replaced by cadence_unit + cadence_count)
ALTER TABLE "budgets" DROP COLUMN "target_cadence";
ALTER TABLE "budgets" DROP COLUMN "target_cadence_months";

-- Drop the index on the old type column
DROP INDEX IF EXISTS "idx_budgets_type";
