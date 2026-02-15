# Budget-to-Transactions Navigation Plan

## Goal

Allow users to click on a budget row in the Budget Overview page and navigate to the Transactions page, pre-filtered by that budget and the current month's date range.

## Current State Analysis

### Budget Overview Page

**Route:** `/budgets/[month]` (e.g., `/budgets/2026-02`)

**Page:** `web/src/app/budgets/[month]/page.tsx`
- Uses `useMonth()` hook to get current month from URL params (format `YYYY-MM`)
- Fetches data via `GetMonthlyOverviewDocument` GraphQL query
- Renders `<BudgetTable>` with `budgetSummaries` and `budgetGroups`

**Budget Table:** `web/src/components/budget/budget-table.tsx`
- Each budget row is rendered by `BudgetRow` component (wrapped in `SortableBudgetRow` for drag-and-drop)
- Each `BudgetSummary` has: `budgetId`, `name`, `targetAmount`, `allocated`, `spent`, `available`, `suggestedAllocation`, `isExpired`, `sortOrder`, `budgetGroupId`
- The budget name cell is currently plain text (line 1013): `<span>{summary.name}</span>`
- The "Spent" cell shows `summary.spent` as formatted currency (line 1064)
- Row actions menu (three dots) has: Edit, Move Funds, Archive

### Transactions Page

**Route:** `/transactions`

**Page:** `web/src/app/transactions/page.tsx`
- Simple wrapper that renders `<TransactionsTable />`

**Transactions Table:** `web/src/components/transactions/transactions-table.tsx`
- Manages filter state internally via `useState<TransactionFilters>`
- **No URL-based filtering** -- filters are entirely in component state
- Filter interface:
  ```ts
  interface TransactionFilters {
    search: string;
    accountId: number | null;
    categoryId: number | null;
    budgetId: number | null;
    type: TransactionTypeEnum | null;
    status: CategorizationStatusEnum | null;
    dateFrom: string;
    dateTo: string;
  }
  ```
- Filters are converted to GraphQL `TransactionFilter` input via `filtersToGraphQL()`
- Filter UI is in `TransactionFiltersBar` component with a popover panel

### GraphQL Schema

**`TransactionFilter` input** supports:
- `budgetId: Int` -- filter by budget database ID
- `dateFrom: String` -- start date (ISO date string, inclusive)
- `dateTo: String` -- end date (ISO date string, inclusive)

Both fields needed for budget-to-transactions navigation are already supported.

### Key Observations

1. The transactions page has **no URL search params support** -- all filtering is local state.
2. The budget table already has `budgetId` available on every row via `summary.budgetId`.
3. The month context (`useMonth`) provides the month in `YYYY-MM` format, which can be converted to `dateFrom`/`dateTo` (first and last day of month).
4. The `getDateRangeFromMonth()` utility already exists in `unbudgeted-transactions-warning.tsx` and can be extracted for reuse.

## Implementation Plan

### Phase 1: Add URL Search Params Support to Transactions Page

The transactions page needs to read initial filter values from URL search params so that navigating from the budget page can pre-set filters.

**URL structure:**
```
/transactions?budgetId=5&dateFrom=2026-02-01&dateTo=2026-02-28
```

**Files to modify:**

1. **`web/src/components/transactions/transactions-table.tsx`**
   - Accept optional `initialFilters` prop (partial `TransactionFilters`)
   - On mount, merge `initialFilters` with `emptyFilters` to set initial state
   - This keeps the component reusable and avoids coupling it to URL params directly

2. **`web/src/app/transactions/page.tsx`**
   - Read `searchParams` from URL using Next.js `useSearchParams()` hook (client component)
   - Parse supported params: `budgetId`, `dateFrom`, `dateTo`, `categoryId`, `accountId`, `type`, `status`, `search`
   - Pass parsed values as `initialFilters` to `<TransactionsTable>`
   - The page remains a client component (already `"use client"`)

**Supported URL params mapping:**
| URL Param | Filter Field | Type | Example |
|-----------|-------------|------|---------|
| `budgetId` | `budgetId` | `number \| null` | `5` |
| `categoryId` | `categoryId` | `number \| null` | `12` |
| `accountId` | `accountId` | `number \| null` | `3` |
| `type` | `type` | `TransactionTypeEnum \| null` | `DEBIT` |
| `status` | `status` | `CategorizationStatusEnum \| null` | `VERIFIED` |
| `dateFrom` | `dateFrom` | `string` | `2026-02-01` |
| `dateTo` | `dateTo` | `string` | `2026-02-28` |
| `search` | `search` | `string` | `groceries` |

### Phase 2: Add Clickable Navigation to Budget Rows

**Files to modify:**

1. **`web/src/components/budget/budget-table.tsx`**
   - Make the budget name a link (`next/link`) pointing to `/transactions?budgetId=<id>&dateFrom=<first>&dateTo=<last>`
   - The month is available via `useMonth()` (already imported)
   - Convert month to date range using the `getDateRangeFromMonth()` utility
   - Alternatively, add a "View Transactions" item to the existing row dropdown menu (three dots menu)
   - Recommended: do both -- make the budget name clickable AND add a menu item

2. **`web/src/lib/url-utils.ts`** (new file)
   - Extract `getDateRangeFromMonth()` from `unbudgeted-transactions-warning.tsx` to a shared utility
   - Add helper `buildTransactionsUrl(filters: Partial<TransactionFilters>): string` that constructs the URL with search params

3. **`web/src/components/budget/unbudgeted-transactions-warning.tsx`**
   - Update to import `getDateRangeFromMonth` from new shared location

### Phase 3: Optional Enhancements

1. **Sync filters back to URL** -- When user changes filters on the transactions page, update URL search params so the filtered view is shareable/bookmarkable. Use `useRouter().replace()` to avoid polluting history.

2. **Add "View Transactions" to group header** -- When clicking a budget group, navigate to transactions filtered by all budgets in that group (would require backend support for `budgetIds: [Int]` array filter, or just link without budget filter but with date range).

3. **Visual affordance** -- Add hover underline or external-link icon on budget names to indicate they are clickable.

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `web/src/app/transactions/page.tsx` | Modify | Read URL search params, pass as `initialFilters` |
| `web/src/components/transactions/transactions-table.tsx` | Modify | Accept `initialFilters` prop, use as initial state |
| `web/src/components/budget/budget-table.tsx` | Modify | Make budget name a link, add "View Transactions" to menu |
| `web/src/lib/url-utils.ts` | Create | Shared `getDateRangeFromMonth()` and `buildTransactionsUrl()` |
| `web/src/components/budget/unbudgeted-transactions-warning.tsx` | Modify | Import shared `getDateRangeFromMonth()` |

## Technical Considerations

1. **No backend changes required** -- The GraphQL `TransactionFilter` already supports `budgetId`, `dateFrom`, and `dateTo`.

2. **Next.js `useSearchParams`** -- Since the transactions page is already a client component, `useSearchParams()` from `next/navigation` works directly. No Suspense boundary needed for the current setup.

3. **Initial filters vs. ongoing state** -- The `initialFilters` prop should only be read once on mount (or when URL changes). After that, user interactions update local state normally. If the user clears filters, it should clear everything including URL-seeded values.

4. **Filter badge count** -- The active filter count badge in `TransactionFiltersBar` will correctly show URL-seeded filters as active, letting users see and clear them.

5. **Navigation pattern** -- Use `next/link` for the budget name (standard navigation) rather than `router.push` for better accessibility and SEO. The link `href` should be computed per-row.

6. **Drag-and-drop interaction** -- The budget name is inside a sortable row. The link must not interfere with drag operations. The drag handle is already separate (grip icon in first column), so clicking the name will navigate as expected without conflict.
