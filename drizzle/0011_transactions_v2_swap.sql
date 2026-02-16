-- Migration: Remove bank-specific columns from transactions and drop old link tables
-- Bank-specific data now lives in bank_transactions (backfilled in migration 0009).
-- Transfer/returning detection is now type-based, replacing exclude_from_calculations.

-- 1. Drop dependent tables first (transaction_link_members references transaction_links)
DROP TABLE IF EXISTS "transaction_link_members";
--> statement-breakpoint
DROP TABLE IF EXISTS "transaction_links";
--> statement-breakpoint

-- 2. Remove bank-specific columns that now live exclusively in bank_transactions
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "original_mcc";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "bank_category";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "balance_after";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "operation_amount";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "operation_currency";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "invoice_id";
--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "counter_edrpou";
--> statement-breakpoint

-- 3. Remove exclude_from_calculations (replaced by type-based filtering: transfer/returning)
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "exclude_from_calculations";
