ALTER TABLE "accounts" ADD COLUMN "source" varchar(20) DEFAULT 'bank_sync' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;