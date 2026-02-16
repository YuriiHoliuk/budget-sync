-- Migration: Create bank_transactions, transaction_sources, transfer_pairs tables
-- Part of the bank/transaction split: separating raw bank data from budgeting representation

-- 1. Create bank_transactions table (immutable bank data)
CREATE TABLE "bank_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "external_id" varchar(255) NOT NULL UNIQUE,
  "account_id" integer REFERENCES "accounts"("id") ON DELETE SET NULL,
  "account_external_id" varchar(255),
  "date" timestamp with time zone NOT NULL,
  "amount" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "type" varchar(10) NOT NULL,
  "mcc" integer,
  "original_mcc" integer,
  "bank_category" varchar(255),
  "bank_description" text,
  "counterparty" varchar(255),
  "counterparty_iban" varchar(34),
  "counter_edrpou" varchar(20),
  "balance_after" bigint,
  "operation_amount" bigint,
  "operation_currency" varchar(3),
  "cashback" bigint DEFAULT 0,
  "commission" bigint DEFAULT 0,
  "hold" boolean DEFAULT false,
  "receipt_id" varchar(255),
  "invoice_id" varchar(255),
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- 2. Create indexes on bank_transactions
CREATE UNIQUE INDEX "idx_bank_transactions_external_id" ON "bank_transactions" USING btree ("external_id");
--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_account_id" ON "bank_transactions" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_date" ON "bank_transactions" USING btree ("date");
--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_account_date" ON "bank_transactions" USING btree ("account_id", "date");
--> statement-breakpoint

-- 3. Backfill bank_transactions from current transactions
INSERT INTO "bank_transactions" (
  "external_id", "account_id", "account_external_id", "date", "amount",
  "currency", "type", "mcc", "original_mcc", "bank_category", "bank_description",
  "counterparty", "counterparty_iban", "counter_edrpou", "balance_after",
  "operation_amount", "operation_currency", "cashback", "commission", "hold",
  "receipt_id", "invoice_id", "created_at"
)
SELECT
  "external_id", "account_id", "account_external_id", "date", "amount",
  "currency", "type", "mcc", "original_mcc", "bank_category", "bank_description",
  "counterparty", "counterparty_iban", "counter_edrpou", "balance_after",
  "operation_amount", "operation_currency", "cashback", "commission", "hold",
  "receipt_id", "invoice_id", "created_at"
FROM "transactions"
WHERE "external_id" IS NOT NULL;
--> statement-breakpoint

-- 4. Fix orphaned account_ids in bank_transactions
UPDATE "bank_transactions" bt
SET "account_id" = a."id"
FROM "accounts" a
WHERE bt."account_external_id" = a."external_id" AND bt."account_id" IS NULL;
--> statement-breakpoint

-- 5. Fix orphaned account_ids in current transactions table
UPDATE "transactions" t
SET "account_id" = a."id"
FROM "accounts" a
WHERE t."account_external_id" = a."external_id" AND t."account_id" IS NULL;
--> statement-breakpoint

-- 6. Create transaction_sources join table (bank_transaction <-> transaction many-to-many)
CREATE TABLE "transaction_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "transaction_id" integer NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "bank_transaction_id" integer NOT NULL REFERENCES "bank_transactions"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- 7. Create indexes on transaction_sources
CREATE INDEX "idx_transaction_sources_transaction_id" ON "transaction_sources" USING btree ("transaction_id");
--> statement-breakpoint
CREATE INDEX "idx_transaction_sources_bank_transaction_id" ON "transaction_sources" USING btree ("bank_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transaction_sources_unique" ON "transaction_sources" USING btree ("transaction_id", "bank_transaction_id");
--> statement-breakpoint

-- 8. Create transfer_pairs table (transfer linking)
CREATE TABLE "transfer_pairs" (
  "id" serial PRIMARY KEY NOT NULL,
  "outgoing_transaction_id" integer NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "incoming_transaction_id" integer NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- 9. Create indexes on transfer_pairs
CREATE UNIQUE INDEX "idx_transfer_pairs_outgoing" ON "transfer_pairs" USING btree ("outgoing_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transfer_pairs_incoming" ON "transfer_pairs" USING btree ("incoming_transaction_id");
