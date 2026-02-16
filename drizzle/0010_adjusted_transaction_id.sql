-- Migration: Add adjusted_transaction_id column to transactions table
-- For returnings: points to the original transaction this one adjusts

ALTER TABLE "transactions" ADD COLUMN "adjusted_transaction_id" integer;
--> statement-breakpoint

-- Add foreign key constraint (self-reference)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_adjusted_transaction_id_fk"
  FOREIGN KEY ("adjusted_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Add index for lookups
CREATE INDEX "idx_transactions_adjusted_transaction_id" ON "transactions" USING btree ("adjusted_transaction_id");
