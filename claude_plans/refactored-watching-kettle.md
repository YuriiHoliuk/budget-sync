# Allow setting budget end date to previous month

## Context

When editing a budget, the end date minimum is set to the first day of the currently viewed month. This means you can't set an end date in the previous month (e.g., Jan 31 while viewing Feb). The user wants to end a monthly budget by setting `endDate = 2026-01-31` while viewing February 2026, which is effectively a current-month action (removing the budget from Feb), not a past-month edit. The current restriction is too aggressive.

## Change

Lower the minimum allowed end date from **first day of current month** to **first day of previous month**.

Example: viewing Feb 2026 → min changes from `2026-02-01` to `2026-01-01`, allowing `2026-01-31`.

## Files to modify

### 1. Backend validation — `src/application/use-cases/UpdateBudget.ts`

Line 166: change `getFirstDayOfMonth(request.month)` to compute the first day of the **previous** month instead.

```typescript
private resolveEndDate(budget: Budget, request: UpdateBudgetRequestDTO): Date | null {
  // ... existing null/undefined checks ...

  const endDateValue = new Date(endDateString);
  const minDate = this.getFirstDayOfPreviousMonth(request.month);  // was: getFirstDayOfMonth
  // ... rest unchanged ...
}

private getFirstDayOfPreviousMonth(month: string): Date {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date;
}
```

### 2. Frontend date picker — `web/src/components/budget/edit-budget-sheet.tsx`

- Line 92-94: change `getFirstDayOfMonth` to compute previous month's first day
- Line 300-303: update help text from "Cannot be set earlier than {current month}" to "Cannot be set earlier than {previous month}"

```typescript
function getFirstDayOfPreviousMonth(month: string): string {
  const date = new Date(`${month}-01`);
  date.setMonth(date.getMonth() - 1);
  const year = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${m}-01`;
}
```

### 3. Unit test — `tests/unit/application/use-cases/UpdateBudget.test.ts`

- Line 225-240: update "should reject endDate before first day of month" test — use a date from **2 months ago** instead of 1 month ago
- Add a new test: "should allow endDate in previous month" confirming previous month dates are accepted

### 4. API integration test — `tests/integration/api/update-budget.test.ts`

- Line 297-334: update "should reject endDate set to past month" test — use a date from **2 months ago**
- Add a new test: "should allow endDate set to previous month" confirming it works

## Verification

1. `just check` — typecheck + lint
2. `just test` — unit tests pass
3. `just test-api` — API integration tests pass
4. Manual: open edit budget sheet, verify date picker allows selecting previous month dates
