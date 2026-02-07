-- Add initial_balance column to accounts table
ALTER TABLE "accounts" ADD COLUMN "initial_balance" bigint;--> statement-breakpoint

-- Add exclude_from_calculations column to transactions table
ALTER TABLE "transactions" ADD COLUMN "exclude_from_calculations" boolean DEFAULT false;--> statement-breakpoint

-- Create transaction_links table
CREATE TABLE "transaction_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_type" varchar(50) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint

-- Create transaction_link_members table
CREATE TABLE "transaction_link_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL,
	"transaction_id" integer NOT NULL,
	"role" varchar(50) NOT NULL
);--> statement-breakpoint

-- Add foreign key constraints for transaction_link_members
ALTER TABLE "transaction_link_members" ADD CONSTRAINT "transaction_link_members_link_id_transaction_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."transaction_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_link_members" ADD CONSTRAINT "transaction_link_members_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Create indexes for transaction_links
CREATE INDEX "idx_transaction_links_type" ON "transaction_links" USING btree ("link_type");--> statement-breakpoint

-- Create indexes for transaction_link_members
CREATE INDEX "idx_transaction_link_members_link" ON "transaction_link_members" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_link_members_transaction" ON "transaction_link_members" USING btree ("transaction_id");--> statement-breakpoint

-- Set initial balances for specific accounts
-- White Card *4618: 132600 (1326 UAH in kopecks)
UPDATE "accounts" SET "initial_balance" = 132600 WHERE "name" LIKE '%4618%';--> statement-breakpoint

-- Iron Card *9727: 52200 (522 UAH in kopecks)
UPDATE "accounts" SET "initial_balance" = 52200 WHERE "name" LIKE '%9727%';--> statement-breakpoint

-- Other accounts: set initial_balance = balance (current balance)
UPDATE "accounts" SET "initial_balance" = "balance" WHERE "initial_balance" IS NULL;
