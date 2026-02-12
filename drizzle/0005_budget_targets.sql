CREATE TABLE "budget_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"target_amount" bigint NOT NULL,
	"effective_from" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "budget_targets" ADD CONSTRAINT "budget_targets_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_budget_targets_budget" ON "budget_targets" USING btree ("budget_id","effective_from");--> statement-breakpoint
INSERT INTO budget_targets (budget_id, target_amount, effective_from)
SELECT id, target_amount, COALESCE(TO_CHAR(start_date, 'YYYY-MM'), '2024-01') FROM budgets;
