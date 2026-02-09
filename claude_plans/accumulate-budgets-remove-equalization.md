# Plan: Make All Budgets Accumulate & Remove Equalization

## Context

Spending budgets currently reset monthly — positive leftover vanishes back to Ready to Assign, only negative balance (debt) carries forward. This causes the core problem: leftover money from underspending disappears and must be manually re-allocated each month. The equalization feature was a workaround that created adjustment allocations to match spent = allocated, but it treated the symptom, not the cause.

**The fix**: All budgets should accumulate (like YNAB). One formula for every type: `available = SUM(all allocations up to month) - SUM(all spending up to month)`. Overspending and underspending both carry forward naturally. The budget type + target settings drive allocation **suggestions**, not balance calculations.

**Data migration safety**: Existing equalization allocations in the DB won't cause issues. They were designed to make `allocated = spent`, so their net contribution to the accumulated balance is zero — equivalent to the old reset behavior.

## Execution Strategy

**Each numbered section below becomes a separate task** (via `TaskCreate`). Each task is implemented by a dedicated **subagent** (via `Task` tool with appropriate `subagent_type`). This ensures:
- Focused context per task — subagents work on one concern at a time
- Parallel execution where tasks are independent
- Clear progress tracking via the task list

**Task dependencies**: Tasks 1–3 are foundational (domain + DB). Task 4 depends on 1–3. Tasks 5–8 depend on 4. Tasks 9–13 depend on 4. Tasks 14–16 depend on all prior. Task 17 (E2E) depends on everything being wired up.

## Changes

### 1. BudgetCalculationService — Unify calculation formula
**File**: `src/domain/services/BudgetCalculationService.ts`

- Remove `computeSpendingBudget()` method
- Remove `computeSpendingCarryover()` method
- Remove `getPreviousMonths()` helper
- Make `computeSingleBudgetSummary()` use the accumulating formula for **all** budget types (what `computeAccumulatingBudget()` does now)
- Remove the `if (budget.type === 'spending')` branching
- Remove `carryover` field from `BudgetSummary` interface
- Add `suggestedAllocation` field to `BudgetSummary` interface
- Expand `BudgetInput` interface with: `targetCadence`, `targetCadenceMonths`, `targetDate`, `cap`
- Add `computeSuggestedAllocation(available, budget, currentMonth)` private method

**Suggestion logic** (all values in minor units):

| Type | Formula |
|------|---------|
| `spending` | `max(0, targetAmount - available)` — "need X available this month" |
| `savings` | `max(0, targetAmount - available)` — "want X total balance" |
| `goal` | `max(0, ceil((targetAmount - available) / monthsRemaining))` — "need X by date" |
| `periodic` | `monthlySaveAmount` per cadence, but `0` if `available >= cap` |

For `periodic` monthly amount: `monthly` → `targetAmount`, `yearly` → `ceil(targetAmount / 12)`, `custom` → `ceil(targetAmount / targetCadenceMonths)`. With cap: `min(monthlyAmount, max(0, cap - available))`.

If `targetAmount <= 0`, suggestion is `0` (no target configured).

### 2. Budget entity — Add `cap` field
**File**: `src/domain/entities/Budget.ts`

- Add `cap: Money | null` to `BudgetProps`
- Add `get cap()` getter

### 3. Database — Add `cap` column
**File**: `src/modules/database/schema/budgets.ts`

- Add `cap: bigint('cap', { mode: 'number' })` (nullable)
- Generate migration: `just db-generate`

**Also update**: Budget mapper in infrastructure to map `cap` from/to DB.

### 4. GraphQL schema — Update types

**`monthlyOverview.graphql`**:
- Remove `carryover` from `BudgetSummary`
- Add `suggestedAllocation: Float!` to `BudgetSummary`

**`budgets.graphql`**:
- Add `cap: Float` to `Budget` type
- Add `cap: Float` to `CreateBudgetInput` and `UpdateBudgetInput`
- Update `BudgetType` enum descriptions (remove "positive balance resets" from SPENDING)

**`allocations.graphql`**:
- Remove `equalizeAllocations` mutation
- Remove `EqualizeAllocationsInput` type
- Remove `EqualizeAllocationsResult` type
- Remove `AllocationAdjustment` type

### 5. Monthly overview resolver — Map new fields
**File**: `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts`

- Pass `targetCadence`, `targetCadenceMonths`, `targetDate`, `cap` when building `budgetInputs`
- Map `suggestedAllocation` to major units in response
- Remove `carryover` mapping

### 6. Budget resolver — Map `cap` field
**File**: `src/presentation/graphql/resolvers/budgetsResolver.ts`

- Handle `cap` in create/update mutations (toMinorUnits)
- Include `cap` in response mapping (toMajorUnits)

### 7. Allocations resolver — Remove equalization
**File**: `src/presentation/graphql/resolvers/allocationsResolver.ts`

- Remove `EqualizeAllocationsUseCase` import and constructor injection
- Remove `equalizeAllocations` method
- Remove `EqualizeAllocationsInput` interface
- Remove `equalizeAllocations` from `getResolverMap()` Mutation

### 8. Delete equalization use case
- Delete `src/application/use-cases/EqualizeAllocations.ts`

### 9. Frontend — Update GraphQL operations

**Remove**:
- `web/src/graphql/mutations/equalize-allocations.graphql`

**Update**:
- `web/src/graphql/queries/monthly-overview.graphql` — remove `carryover`, add `suggestedAllocation`
- `web/src/graphql/queries/budgets.graphql` — add `cap` (if not already there)
- `web/src/graphql/mutations/budgets.graphql` — add `cap` to inputs
- Run `just codegen` to regenerate types

### 10. Frontend — Update budget table
**File**: `web/src/components/budget/budget-table.tsx`

- Remove "Equalize All" button and `handleEqualizeAll` function
- Remove `equalizeAllocations` mutation import and hook
- Remove `hasSpendingMismatch` check
- Remove `Equal` icon import
- Remove per-budget "Equalize with Spending" dropdown menu item
- Remove `onEqualize` prop from BudgetGroup and BudgetRow
- Remove `handleEqualize` function

### 11. Frontend — Show suggested allocation
**File**: `web/src/components/budget/budget-table.tsx`

- Add "Suggested" column to the table (between Target and Allocated, or as a visual hint on the Allocated cell)
- Display `suggestedAllocation` value; muted if 0, highlighted if > 0
- Consider: clicking the suggestion could pre-fill the inline allocation editor

### 12. Frontend — Add `cap` to budget dialogs
**Files**: `web/src/components/budget/create-budget-dialog.tsx`, `edit-budget-dialog.tsx`

- Add `cap` field (optional number input, shown for PERIODIC and SAVINGS types)
- Label: "Maximum Balance" or "Cap"

### 13. Frontend — Update cache utils
**File**: `web/src/lib/cache-utils.ts` (and test)

- Remove `carryover` from any cache update logic

### 14. Tests — Update unit tests

**Update** `tests/unit/domain/services/BudgetCalculationService.test.ts`:
- Remove "should NOT carry forward positive balance from previous month" test
- Update "spending budget summaries" → all spending tests should use accumulating behavior
- Remove carryover assertions
- Add tests for `suggestedAllocation` for each budget type
- Add tests for cap behavior in suggestions

**Delete** `tests/unit/application/use-cases/EqualizeAllocations.test.ts`

**Update/add** API integration tests if they exist for monthly overview (add `suggestedAllocation` assertions).

### 15. E2E tests — Update existing and add new scenarios

**Existing tests to update** (in `e2e/tests/budget/`):
- `budget-table.spec.ts` — verify no Equalize buttons exist, verify suggested allocation column is visible
- `edit-allocation.spec.ts` — verify clicking suggested amount pre-fills inline editor (if implemented)
- `metrics-display.spec.ts` — no changes needed (metrics don't include carryover)

**New E2E test: accumulation behavior** (`e2e/tests/budget/budget-accumulation.spec.ts`):
- Seed: create a spending budget, create allocation for month M, create transactions spending less than allocated
- Navigate to month M+1
- Assert: available balance shows the leftover from month M (proves accumulation works)
- Assert: suggested allocation shows `max(0, target - available)` (reduced by leftover)

**New E2E test: suggested allocation display** (`e2e/tests/budget/suggested-allocation.spec.ts`):
- Seed: create budgets of each type with targets
- Assert: suggested allocation values are displayed correctly for each type
- Assert: spending budget with leftover shows reduced suggestion
- Assert: goal budget divides remaining by months left
- Assert: budget at cap shows suggestion of 0

**Page object updates** (`e2e/pages/BudgetPage.ts`):
- Add `getSuggestedAllocation(budgetName)` accessor
- Remove any equalization-related methods (if they exist)

**Data factory updates** (`e2e/fixtures/data-factories.ts`):
- Add `cap` to `createBudget()` input type
- Update `getMonthlyOverview()` query to include `suggestedAllocation` instead of `carryover`

### 16. Documentation
**Update** `docs/envelope-budgeting.md`:
- Remove the spending vs accumulating distinction in "Budget Types" section
- Document that ALL budgets accumulate: `available = SUM(allocated ≤ M) - SUM(spent ≤ M)`
- Remove the spending carryover formula
- Add section on allocation suggestions
- Add `cap` to budget properties
- Remove mention of equalization
- Update "Monthly Workflow" section

**Update** `docs/graphql-api.md`:
- Remove `equalizeAllocations` mutation
- Add `suggestedAllocation` field
- Add `cap` field
- Remove `carryover` field

## File Summary

| Action | Files |
|--------|-------|
| **Modify** | `BudgetCalculationService.ts`, `Budget.ts`, `budgets.ts` (schema), `monthlyOverview.graphql`, `budgets.graphql`, `allocations.graphql`, `monthlyOverviewResolver.ts`, `budgetsResolver.ts`, `allocationsResolver.ts`, `budget-table.tsx`, `create-budget-dialog.tsx`, `edit-budget-dialog.tsx`, `monthly-overview.graphql` (query), `cache-utils.ts`, `BudgetCalculationService.test.ts`, budget mapper, `BudgetPage.ts` (page object), `data-factories.ts`, `budget-table.spec.ts` |
| **Delete** | `EqualizeAllocations.ts`, `EqualizeAllocations.test.ts`, `equalize-allocations.graphql` (frontend mutation) |
| **Create** | DB migration (via `just db-generate`), `budget-accumulation.spec.ts`, `suggested-allocation.spec.ts` |

## Verification

1. `just check` — typecheck + lint pass
2. `just test` — unit tests pass (updated + new suggestion tests)
3. `just test-api` — API integration tests pass
4. `just test-e2e` — E2E tests pass (updated + new accumulation/suggestion tests)
5. `just dev` → open browser → verify:
   - Budget table shows no Equalize buttons
   - Spending budgets carry forward leftover from previous months
   - Suggested allocation column shows correct values
   - Creating a budget with `cap` works
   - Ready to Assign is correct (not inflated by spending resets)
