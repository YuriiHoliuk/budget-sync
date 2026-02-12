CREATE TABLE "budget_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" varchar(50),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "budget_group_id" integer;--> statement-breakpoint
CREATE INDEX "idx_budget_groups_sort_order" ON "budget_groups" USING btree ("sort_order");--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_budget_group_id_budget_groups_id_fk" FOREIGN KEY ("budget_group_id") REFERENCES "public"."budget_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_budgets_group" ON "budgets" USING btree ("budget_group_id");
