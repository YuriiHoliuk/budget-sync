# Safe Migration Plan: Budget Schema Changes

## Current State

### Production Database (sweet-art-12798914)
**Schema:**
- `type` column exists (varchar, NOT NULL)
- `target_cadence` exists (varchar, nullable)
- `target_cadence_months` exists (integer, nullable)
- No `cadence_unit`, `cadence_count`, `sort_order`, `budget_group_id` yet
- No `budget_targets` table

**Data:**
- 24 budgets, ALL are `type='spending'`
- ALL have `target_cadence = NULL`
- ALL have `target_cadence_months = NULL`
- ALL have `target_date = NULL`

### Local Changes (24 commits ahead)
Migrations 0004-0008 ready but not pushed:
| Migration | Action | Risk |
|-----------|--------|------|
| 0004 | Add cadence_unit/count, backfill, DROP target_cadence columns | Medium |
| 0005 | CREATE budget_targets table, backfill | Low (additive) |
| 0006 | DROP type column | High |
| 0007 | Add sort_order column, backfill | Low (additive) |
| 0008 | CREATE budget_groups table, add FK | Low (additive) |

## Risk Analysis

### Why Current Migrations Are Risky

**Problem 1: Atomic deployment assumption**
The migrations assume code and schema deploy atomically. In reality:
1. CI runs migrations → schema changes
2. Then deploys new code

If migration succeeds but deployment fails, you're stuck with new schema + old code that expects old columns.

**Problem 2: Rollback is destructive**
Once `type` and `target_cadence` columns are dropped, rolling back requires:
1. Re-adding columns
2. Re-populating data (which is now lost)

**Problem 3: No verification step**
We're trusting the backfill logic without verifying in production.

### Why Current Data Is "Safe" (with caveats)

For `spending` type budgets with no cadence:
- Old behavior: `max(0, target - available)` (simple formula)
- New behavior: no cadence_unit + no target_date → same simple formula

✅ Behavior is preserved for current production data.

⚠️ But if deployment fails mid-way, the app breaks.

## Recommended Approach: Phased Migration

### Phase 1: Additive Changes Only (Safe)

**Create new migration 0004a — Add new columns (no drops):**
```sql
-- Add new cadence columns
ALTER TABLE "budgets" ADD COLUMN "cadence_unit" varchar(10);
ALTER TABLE "budgets" ADD COLUMN "cadence_count" integer;

-- Backfill from old columns (for future data, not current)
UPDATE "budgets" SET "cadence_unit" = 'month', "cadence_count" = 1
WHERE "target_cadence" = 'monthly';
UPDATE "budgets" SET "cadence_unit" = 'year', "cadence_count" = 1
WHERE "target_cadence" = 'yearly';
UPDATE "budgets" SET "cadence_unit" = 'month', "cadence_count" = "target_cadence_months"
WHERE "target_cadence" = 'custom';

-- Add sort_order
ALTER TABLE "budgets" ADD COLUMN "sort_order" varchar(50);
-- Backfill sort_order...

-- Add budget_group_id
ALTER TABLE "budgets" ADD COLUMN "budget_group_id" integer;
```

**Create budget_targets table (0005 is already safe)**

**Update code to:**
- READ from new columns (cadence_unit, cadence_count)
- WRITE to both old AND new columns (dual-write)
- Handle missing new columns gracefully (fallback to old)

### Phase 2: Verify Production

After Phase 1 deployment:
1. Query production to verify new columns populated correctly
2. Verify application works with new columns
3. Monitor for errors

```sql
-- Verification queries
SELECT id, name, type, target_cadence, cadence_unit, cadence_count
FROM budgets LIMIT 10;

SELECT COUNT(*) FROM budget_targets;
```

### Phase 3: Remove Dual-Write, Drop Old Columns

Only after Phase 2 verification:

**Create migration 0009 — Drop old columns:**
```sql
DROP INDEX IF EXISTS "idx_budgets_type";
ALTER TABLE "budgets" DROP COLUMN "type";
ALTER TABLE "budgets" DROP COLUMN "target_cadence";
ALTER TABLE "budgets" DROP COLUMN "target_cadence_months";
```

**Update code to:**
- Remove all references to old columns
- Remove dual-write logic

## Simplified Approach (Given Current Data)

Since production has:
- Only `spending` type (simple formula)
- No cadence data to preserve
- No target_date data

We can simplify:

### Option A: Single Deploy with Verification Branch

1. **Create Neon branch** for testing migration:
   ```
   neon branches create --project-id sweet-art-12798914 --name migration-test
   ```

2. **Run migrations on branch** to verify they work

3. **Test application against branch** to verify behavior

4. **If successful, push to main** → migrations run on production

5. **Keep branch as rollback point** (Neon time-travel)

### Option B: Restructure Migrations (Recommended)

Restructure the 5 migrations into 2 phases:

**Phase 1 PR (additive only):**
- 0004a: Add cadence_unit, cadence_count (no drops)
- 0005: Create budget_targets (already safe)
- 0007a: Add sort_order (no backfill script, just column)
- 0008: Create budget_groups (already safe)
- Code: Read new columns, write both old+new

**Phase 2 PR (after verification):**
- 0009: Drop type, target_cadence, target_cadence_months
- 0010: Backfill sort_order for existing budgets
- Code: Remove old column references

## Implementation Steps

### Step 1: Restructure Migrations

1. Create backup of current migrations:
   ```bash
   cp -r drizzle drizzle.backup
   ```

2. Modify 0004 to NOT drop old columns

3. Modify 0007 to just add column (move backfill to later migration)

4. Update code mappers to handle both old and new columns

### Step 2: Update Code for Dual-Read

**DatabaseBudgetMapper.ts** — read from new columns, fallback to old:
```typescript
cadenceUnit: row.cadence_unit ?? convertOldCadence(row.target_cadence),
cadenceCount: row.cadence_count ?? row.target_cadence_months ?? 1,
```

**Budget resolvers** — write to both:
```typescript
// In create/update mutations
cadence_unit: input.cadenceUnit,
cadence_count: input.cadenceCount,
// Keep old columns for backward compat
target_cadence: convertToOldCadence(input.cadenceUnit, input.cadenceCount),
target_cadence_months: input.cadenceCount,
```

### Step 3: Test Locally

```bash
just dev-fresh    # Reset local DB
just test         # Unit tests
just test-api     # API tests
just test-e2e     # E2E tests
```

### Step 4: Deploy Phase 1

```bash
git push origin main
# Monitor CI/CD
# Verify production after deploy
```

### Step 5: Verify Production

```sql
-- Check new columns populated
SELECT id, name, cadence_unit, cadence_count, sort_order
FROM budgets;

-- Check budget_targets created
SELECT * FROM budget_targets;

-- Check budget_groups exists
SELECT * FROM budget_groups;
```

### Step 6: Deploy Phase 2 (Drop Old Columns)

After verification, create new PR to drop old columns.

## Decision

Given:
- Small dataset (24 budgets)
- All simple spending type
- Personal project (acceptable downtime)
- Neon has time-travel for recovery

**Recommendation:** Option A (single deploy with Neon branch testing) is acceptable, BUT restructuring migrations (Option B) is safer for learning good practices.

Which approach do you prefer?
