CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" varchar(255),
	"name" varchar(255),
	"external_name" varchar(255),
	"type" varchar(50) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"role" varchar(50) DEFAULT 'operational' NOT NULL,
	"credit_limit" bigint DEFAULT 0,
	"iban" varchar(34),
	"bank" varchar(100),
	"last_sync_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "accounts_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "accounts_iban_unique" UNIQUE("iban")
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"period" varchar(7) NOT NULL,
	"date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budgetization_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule" text NOT NULL,
	"priority" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) DEFAULT 'spending' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"target_amount" bigint NOT NULL,
	"target_cadence" varchar(20),
	"target_cadence_months" integer,
	"target_date" date,
	"start_date" date,
	"end_date" date,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "budgets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_id" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule" text NOT NULL,
	"priority" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"currency" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "exchange_rates_date_currency" UNIQUE("date","currency")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" varchar(255),
	"date" timestamp with time zone NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"type" varchar(10) NOT NULL,
	"account_id" integer,
	"account_external_id" varchar(255),
	"category_id" integer,
	"budget_id" integer,
	"categorization_status" varchar(20) DEFAULT 'pending',
	"category_reason" text,
	"budget_reason" text,
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
	"tags" text[],
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "transactions_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_bank" ON "accounts" USING btree ("bank");--> statement-breakpoint
CREATE INDEX "idx_accounts_role" ON "accounts" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_allocations_budget_id" ON "allocations" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "idx_allocations_period" ON "allocations" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_allocations_budget_period" ON "allocations" USING btree ("budget_id","period");--> statement-breakpoint
CREATE INDEX "idx_budgets_type" ON "budgets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_budgets_dates" ON "budgets" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_budgets_active" ON "budgets" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "idx_categories_status" ON "categories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_categories_parent" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_date" ON "exchange_rates" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_currency" ON "exchange_rates" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "idx_transactions_date" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_transactions_account_id" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_account_external_id" ON "transactions" USING btree ("account_external_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_category_id" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_budget_id" ON "transactions" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_categorization_status" ON "transactions" USING btree ("categorization_status");--> statement-breakpoint
CREATE INDEX "idx_transactions_counterparty" ON "transactions" USING btree ("counterparty");--> statement-breakpoint
CREATE INDEX "idx_transactions_type" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_transactions_date_category" ON "transactions" USING btree ("date","category_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_date_budget" ON "transactions" USING btree ("date","budget_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_account_date" ON "transactions" USING btree ("account_id","date");