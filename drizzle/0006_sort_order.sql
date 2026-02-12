ALTER TABLE "budgets" ADD COLUMN "sort_order" varchar(50);--> statement-breakpoint
CREATE INDEX "idx_budgets_sort_order" ON "budgets" USING btree ("sort_order");--> statement-breakpoint
-- Backfill existing budgets with fractional indexing keys ordered by id.
-- Uses the base-62 character set: 0-9 (positions 0-9), A-Z (10-35), a-z (36-61).
-- Generates keys: a0, a1, ..., a9, aA, aB, ..., aZ, aa, ab, ..., az
DO $$
DECLARE
  chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  budget_record RECORD;
  idx integer := 0;
BEGIN
  FOR budget_record IN
    SELECT id FROM budgets WHERE sort_order IS NULL ORDER BY id
  LOOP
    UPDATE budgets
    SET sort_order = 'a' || substring(chars from (idx + 1) for 1)
    WHERE id = budget_record.id;
    idx := idx + 1;
    IF idx >= 62 THEN
      RAISE EXCEPTION 'More than 62 budgets, need multi-character keys';
    END IF;
  END LOOP;
END $$;
