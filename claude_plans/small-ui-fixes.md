# Small UI Fixes Plan

Six independent frontend fixes for the Budget Sync web app.

---

## 1. Sticky Budget Table Header

**Problem:** When the budget table has many rows, scrolling down loses sight of the column headers (Budget, Target, Allocated, Spent, Available, Progress).

**Root Cause:** The `<TableHeader>` in `budget-table.tsx` has no sticky positioning. The table is inside a `<div className="rounded-xl border">` wrapper, and the outer `<main>` in `app-shell.tsx` has `overflow-auto`, so the scroll container is the main content area.

**Fix:**

File: `web/src/components/budget/budget-table.tsx`

Add `sticky top-0 z-10 bg-background` classes to the `<TableHeader>` element (line 469). Since the table is inside a `rounded-xl border` div that is itself inside the scrollable `<main>` element, the sticky positioning will work relative to the main scroll container.

```tsx
<TableHeader className="sticky top-0 z-10 bg-background">
```

The `bg-background` ensures the header has an opaque background so content doesn't show through when scrolling beneath it.

**Files to change:**
- `web/src/components/budget/budget-table.tsx` (line 469) -- add className to `<TableHeader>`

---

## 2. Fix Percentage Color at 100%

**Problem:** The budget progress bar shows red at exactly 100%, but 100% means the budget is fully used (not overspent). Red should only indicate overspending (when `available < 0`).

**Root Cause:** In `budget-table.tsx`, the `getProgressBarColor` function (line 1120-1124) uses `percentage >= 100` to trigger red:

```typescript
function getProgressBarColor(percentage: number): string {
  if (percentage >= 100) return "bg-red-500";
  if (percentage >= 80) return "bg-yellow-500";
  return "bg-green-500";
}
```

However, `getProgressPercentage` (line 104-107) caps the value at 100 with `Math.min(..., 100)`, so we cannot distinguish between "exactly 100%" and "over 100%". The percentage alone is insufficient to determine overspending.

**Fix:**

The progress bar color should be based on the budget's `available` amount, not just the percentage:
- `available < 0` (overspent) --> red
- `available === 0` (exactly on budget, i.e., 100%) --> green or yellow (fully used but not over)
- `available > 0` (under budget) --> green or yellow depending on percentage

Change `BudgetProgressBar` to also accept `available` and change `getProgressBarColor` to use it:

```typescript
function getProgressBarColor(percentage: number, available: number): string {
  if (available < 0) return "bg-red-500";
  if (percentage >= 80) return "bg-yellow-500";
  return "bg-green-500";
}
```

Update `BudgetProgressBar` component signature to accept `available`:

```tsx
function BudgetProgressBar({ percentage, available }: { percentage: number; available: number }) {
```

Update the call site in `BudgetRow` (line 1087-1089) to pass `summary.available`:

```tsx
<BudgetProgressBar percentage={progressPercentage} available={summary.available} />
```

**Files to change:**
- `web/src/components/budget/budget-table.tsx`:
  - `getProgressBarColor` function (line 1120) -- add `available` parameter, change condition from `percentage >= 100` to `available < 0`
  - `BudgetProgressBar` component (line 1126) -- add `available` prop
  - `BudgetRow` component (line 1088) -- pass `summary.available` to `BudgetProgressBar`

---

## 3. Month Change in Transactions Redirects to Budgets

**Problem:** The month selector is in the global app header (`app-header.tsx`). Changing the month while on the transactions page navigates the user to `/budgets/{month}` instead of staying on the transactions page.

**Root Cause:** In `web/src/hooks/use-month.tsx` (line 37-43), the `setMonth` callback always navigates to `/budgets/${newMonth}`:

```typescript
const setMonth = useCallback(
  (newMonth: string) => {
    if (!MONTH_PATTERN.test(newMonth)) return;
    router.push(`/budgets/${newMonth}`);
  },
  [router],
);
```

This is hardcoded to the budgets route regardless of what page the user is currently on.

**Fix:**

The `setMonth` function should be context-aware. Two approaches:

**Option A (Recommended): Use current pathname to determine navigation target.**

Use `usePathname()` from Next.js to detect the current page. If on the budgets page, navigate to `/budgets/{month}`. On other pages, either update a URL search param or do nothing (since most other pages don't use the month parameter for routing).

Since the budgets page is the only route with `[month]` in the URL, the fix is:
- If the current path starts with `/budgets`, navigate to `/budgets/${newMonth}`
- Otherwise, stay on the current page (the month context value still updates for components that read it)

```typescript
import { useParams, usePathname, useRouter } from "next/navigation";

// Inside MonthProvider:
const pathname = usePathname();

const setMonth = useCallback(
  (newMonth: string) => {
    if (!MONTH_PATTERN.test(newMonth)) return;

    if (pathname.startsWith("/budgets")) {
      router.push(`/budgets/${newMonth}`);
    } else {
      // For non-budget pages, update the month in context without navigating
      // The month value is already derived from the route param, so we need
      // a local state fallback for non-budget pages
    }
  },
  [router, pathname],
);
```

However, there is a complication: the `month` value is currently derived solely from `params.month` (the URL segment). On pages without `[month]` in the URL (like `/transactions`), `params.month` is undefined and `getCurrentMonth()` is used as a fallback.

The proper fix requires adding local state to `MonthProvider` that overrides the route-derived month when on non-budget pages:

```typescript
const [overrideMonth, setOverrideMonth] = useState<string | null>(null);

const month = useMemo(() => {
  if (params.month && MONTH_PATTERN.test(params.month)) {
    return params.month;
  }
  return overrideMonth ?? getCurrentMonth();
}, [params.month, overrideMonth]);

const setMonth = useCallback(
  (newMonth: string) => {
    if (!MONTH_PATTERN.test(newMonth)) return;

    if (pathname.startsWith("/budgets")) {
      setOverrideMonth(null);
      router.push(`/budgets/${newMonth}`);
    } else {
      setOverrideMonth(newMonth);
    }
  },
  [router, pathname],
);
```

Additionally, when navigating to the budgets page (via sidebar), the override month should be cleared so the URL takes precedence. This happens naturally because `params.month` will be available and takes priority in the `useMemo`.

**Files to change:**
- `web/src/hooks/use-month.tsx` -- add `usePathname`, local override state, conditional navigation logic

---

## 4. Not All Budgets Available in Transaction Filter

**Problem:** The budget filter dropdown in the transactions page doesn't show all budgets. Some budgets that have transactions assigned to them are missing from the dropdown.

**Root Cause:** In `web/src/components/transactions/transactions-table.tsx` (line 200-201), the budgets query uses `activeOnly: true`:

```typescript
const { data: budgetsData } = useQuery(GetBudgetsDocument, {
  variables: { activeOnly: true },
});
```

On the backend, `activeOnly: true` calls `budgetRepository.findActive(new Date())` (in `budgetsResolver.ts` line 88-89), which filters budgets by:
1. `isArchived = false`
2. `startDate <= today` (or null)
3. `endDate >= today` (or null)

This means budgets with an `endDate` in the past (expired but not archived) are excluded from the dropdown. If a transaction references such a budget, the user cannot filter by it.

Additionally, line 223-226 applies a redundant frontend filter:
```typescript
const budgets = useMemo(
  () => (budgetsData?.budgets ?? []).filter((b) => !b.isArchived),
  [budgetsData]
);
```

This is redundant since `activeOnly: true` already excludes archived budgets on the backend.

**Fix:**

Change the budget query in the transactions table to fetch ALL non-archived budgets (not just active ones). Use `activeOnly: false` and filter out archived ones on the frontend:

```typescript
const { data: budgetsData } = useQuery(GetBudgetsDocument, {
  variables: { activeOnly: false },
});
```

Keep the existing frontend filter that removes archived budgets (line 223-226), which is now necessary since we're fetching all budgets including archived ones.

Alternatively, a more targeted fix would be to add a new backend query parameter like `includeExpired: true` to `findActive`, but that adds backend complexity for a simple UI fix. The simplest correct approach is to fetch all budgets and filter archived on the frontend.

**Files to change:**
- `web/src/components/transactions/transactions-table.tsx` (line 200-201) -- change `activeOnly: true` to `activeOnly: false`

The same issue may exist in:
- `web/src/components/transactions/transaction-detail-panel.tsx` (line 135) -- check if it also uses `activeOnly: true` and fix if so

---

## 5. Transaction Detail Sidebar Padding (UI-005)

**Problem:** The transaction detail panel (right sidebar/sheet) has no horizontal padding on the body content. Text, selects, and detail rows touch the left and right edges of the sidebar. The bottom content also has no padding before the edge.

**Root Cause:** In `web/src/components/transactions/transaction-detail-panel.tsx`, the `SheetContent` element (line 156) has `className="w-full overflow-y-auto sm:max-w-lg"` but no padding. The `SheetHeader` gets its own `p-4` from the Sheet UI component (`web/src/components/ui/sheet.tsx` line 92), but the body content div (line 292: `<div className="mt-6 space-y-6">`) has no `px-*` or `pb-*` classes.

The Sheet UI component's `SheetContent` intentionally does not add padding -- it only provides `gap-4` between flex children. Padding is expected to be applied by the consumer or by `SheetHeader`/`SheetFooter` (which each have `p-4`).

**Fix:**

File: `web/src/components/transactions/transaction-detail-panel.tsx`

Add `px-4 pb-6` to the body content div at line 292:

```tsx
// Before:
<div className="mt-6 space-y-6">

// After:
<div className="mt-6 space-y-6 px-4 pb-6">
```

This matches the horizontal padding that `SheetHeader` already applies (`p-4` includes `px-4`), creating consistent left/right margins. The `pb-6` provides breathing room at the bottom of the scrollable content.

**Files to change:**
- `web/src/components/transactions/transaction-detail-panel.tsx` (line 292) -- add `px-4 pb-6` to the body content div

---

## 6. Prominent Verify Button for AI-Categorized Transactions (UI-006)

**Problem:** When AI categorizes a transaction (status = "categorized"), the user wants a quick one-click way to approve the AI's work without having to change category or budget. Currently, changing category or budget auto-verifies (TX-008), but there is no prominent "approve" action for when the AI got it right.

**Current State:**

Both the detail panel and the table already have verify functionality wired up:

1. **Detail Panel** (`transaction-detail-panel.tsx`, lines 357-371): Shows a full-width `variant="outline"` button labeled "Verify Categorization" with a checkmark icon for all non-verified transactions. This button works but is not visually prominent -- it uses the same muted outline style regardless of whether the transaction is "pending" or "categorized".

2. **Transactions Table** (`transactions-table.tsx`, lines 790-803): Shows a small `variant="ghost"` checkmark icon button in the last column for non-verified transactions. This is very subtle and easy to miss, especially for "categorized" transactions where verification is the primary expected action.

3. **GraphQL Mutation**: `VerifyTransaction` mutation exists in `web/src/graphql/mutations/transactions.graphql` and is already imported and wired in both components.

**Fix:**

### Detail Panel Changes

File: `web/src/components/transactions/transaction-detail-panel.tsx`

Make the verify button more prominent when the transaction has "categorized" status (AI-assigned):

```tsx
// Before (lines 357-371):
{!isVerified && (
  <Button onClick={handleVerify} disabled={isUpdating} className="w-full" variant="outline">
    ...
    Verify Categorization
  </Button>
)}

// After:
{!isVerified && (
  <Button
    onClick={handleVerify}
    disabled={isUpdating}
    className="w-full"
    variant={isCategorized ? "default" : "outline"}
  >
    ...
    {isCategorized ? "Approve AI Categorization" : "Verify Categorization"}
  </Button>
)}
```

Add a boolean: `const isCategorized = transaction.categorizationStatus === CategorizationStatusEnum.Categorized;`

When status is "categorized", the button becomes the primary/default variant (filled, visually prominent) with the label "Approve AI Categorization". When status is "pending", it stays as the current subtle outline button.

### Transactions Table Changes

File: `web/src/components/transactions/transactions-table.tsx`

Make the inline verify button more visible for "categorized" transactions:

```tsx
// Before (lines 790-803):
) : !isVerified ? (
  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" ...>
    <Check className="h-4 w-4" />
  </Button>
) : null}

// After:
) : !isVerified ? (
  <Button
    variant={isCategorized ? "outline" : "ghost"}
    size="sm"
    className={cn("h-8 w-8 p-0", isCategorized && "border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30")}
    onClick={handleVerify}
    disabled={isUpdating}
    title={isCategorized ? "Approve AI categorization" : "Verify transaction"}
    data-qa={`btn-verify-${transaction.id}`}
  >
    <Check className="h-4 w-4" />
  </Button>
) : null}
```

Add a boolean in TransactionRow: `const isCategorized = transaction.categorizationStatus === CategorizationStatusEnum.Categorized;`

For "categorized" transactions, the verify button uses an outline variant with blue coloring (matching the blue "Categorized" badge), making it visually stand out. For "pending" transactions, it remains the current subtle ghost button. The title tooltip also changes to "Approve AI categorization" for clarity.

**Files to change:**
- `web/src/components/transactions/transaction-detail-panel.tsx`:
  - Add `isCategorized` boolean (after existing `isVerified`)
  - Change verify button variant and label based on `isCategorized`
- `web/src/components/transactions/transactions-table.tsx`:
  - Add `isCategorized` boolean in `TransactionRow` (after existing `isVerified`)
  - Change inline verify button styling and title based on `isCategorized`

---

## Summary of Changes

| Task | File(s) | Complexity |
|------|---------|------------|
| Sticky header | `budget-table.tsx` | Trivial (1 line) |
| Fix 100% color | `budget-table.tsx` | Small (3 locations) |
| Month redirect | `use-month.tsx` | Medium (state + pathname logic) |
| Budget filter | `transactions-table.tsx`, possibly `transaction-detail-panel.tsx` | Small (1-2 lines) |
| Sidebar padding | `transaction-detail-panel.tsx` | Trivial (1 line) |
| Verify button | `transaction-detail-panel.tsx`, `transactions-table.tsx` | Small (2 files, ~5 lines each) |
