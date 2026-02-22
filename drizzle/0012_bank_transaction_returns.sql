CREATE TABLE "bank_transaction_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_bank_transaction_id" integer NOT NULL,
	"returning_bank_transaction_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bank_transaction_returns" ADD CONSTRAINT "bank_transaction_returns_original_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("original_bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transaction_returns" ADD CONSTRAINT "bank_transaction_returns_returning_bank_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("returning_bank_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bank_transaction_returns_pair" ON "bank_transaction_returns" USING btree ("original_bank_transaction_id","returning_bank_transaction_id");
