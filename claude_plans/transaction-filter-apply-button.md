# Transaction Filter Apply Button

## Problem

When the user interacts with transaction filters (selecting an account, category, type, status, or changing date inputs), each individual change immediately triggers a GraphQL re-fetch. This causes:

1. **Loading spinners on every interaction** -- Selecting a category in the popover triggers a network request and shows a loading state before the user has finished configuring all their filters.
2. **Popover closes prematurely** -- The Radix Select components inside the Popover cause focus shifts that can close the filter popover, forcing the user to reopen it for the next filter.
3. **Redundant API calls** -- If the user wants to set account + category + date range, three separate queries fire instead of one.
4. **No way to preview filter configuration** -- The user cannot see all their pending filter choices before they take effect.

## Current Architecture

### Filter State Flow

All filter logic lives in a single component: `TransactionsTable` (`web/src/components/transactions/transactions-table.tsx`).

```
TransactionsTable (lines 177-352)
  |-- state: filters (TransactionFilters)     -- useState, line 178
  |-- state: page (number)                    -- useState, line 179
  |-- derived: gqlFilter                      -- useMemo from filters, line 183
  |-- useQuery(GetTransactionsDocument, { variables: { filter: gqlFilter, pagination } })
  |
  +-- TransactionFiltersBar (lines 364-538)
        |-- receives: filters, onFilterChange, onClearFilters
        |-- state: isOpen (popover open/close)
        |-- Search input (onChange -> onFilterChange("search", value))
        |-- Popover with:
        |     Account Select   (onValueChange -> onFilterChange("accountId", ...))
        |     Category Select  (onValueChange -> onFilterChange("categoryId", ...))
        |     Budget Select    (onValueChange -> onFilterChange("budgetId", ...))
        |     Type Select      (onValueChange -> onFilterChange("type", ...))
        |     Status Select    (onValueChange -> onFilterChange("status", ...))
        |     Date From Input  (onChange -> onFilterChange("dateFrom", ...))
        |     Date To Input    (onChange -> onFilterChange("dateTo", ...))
```

### What Triggers Data Fetching

Every call to `handleFilterChange` (line 228) calls `setFilters(...)`, which updates the `filters` state. This causes `gqlFilter` (the `useMemo` on line 183) to recompute, which changes the `variables` prop on `useQuery`, which triggers an Apollo Client network request.

**Chain:** `Select onValueChange` -> `handleFilterChange` -> `setFilters` -> `gqlFilter recalculates` -> `useQuery refetches`

### Key Types

```typescript
// web/src/components/transactions/transactions-table.tsx, lines 112-121
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

### URL Parameters

Currently, **no URL parameters are used** for transaction filters. The `useMonth` hook uses URL params for the budget page, but the transactions page stores all filter state purely in React component state. This means filters are lost on page refresh.

### E2E Test Impact

The `TransactionsPage` page object (`e2e/pages/TransactionsPage.ts`) has methods like `filterByStatus()`, `filterByAccount()`, etc. that:
1. Open the filters popover
2. Click a select trigger
3. Click an option
4. Press Escape to close the popover

These methods will need updating to accommodate the new Apply button flow.

## Proposed Changes

### 1. Introduce Draft vs Applied Filter State

Split the single `filters` state into two:

- **`draftFilters`** -- The working copy the user manipulates inside the popover. Changes here do NOT trigger data fetching.
- **`appliedFilters`** -- The committed filters that drive the GraphQL query. Only updated when the user clicks "Apply".

```typescript
// In TransactionsTable:
const [appliedFilters, setAppliedFilters] = useState<TransactionFilters>(emptyFilters);
const [draftFilters, setDraftFilters] = useState<TransactionFilters>(emptyFilters);

// Only appliedFilters drives the query
const gqlFilter = useMemo(() => filtersToGraphQL(appliedFilters), [appliedFilters]);
```

### 2. Add Apply and Reset Buttons to Filter Popover

Add a sticky footer inside the `PopoverContent` with two buttons:

- **Apply** -- Copies `draftFilters` to `appliedFilters`, resets page to 0, closes the popover.
- **Reset** -- Clears `draftFilters` back to `emptyFilters`. Does NOT close the popover (allows the user to confirm the reset before applying).

The button area should visually indicate whether draft differs from applied (e.g., Apply button is primary/highlighted when there are pending changes).

```
+---------------------------+
| Account    [All accounts] |
| Category   [Groceries   ] |
| Budget     [All budgets  ] |
| Type       [All types    ] |
| Status     [Pending      ] |
| From [____]  To [____]    |
+---------------------------+
| [Reset]          [Apply]  |
+---------------------------+
```

### 3. Keep Popover Open During Interactions

The current Popover uses Radix UI's default behavior where clicking outside closes it. The Radix Select components inside the popover render their dropdown via a Portal, which counts as "outside" the popover, causing it to close.

Fix by setting `modal={false}` on the Popover and handling dismiss behavior manually, or by using the `onInteractOutside` event on PopoverContent to prevent closing when the interaction is with a Select portal.

Alternatively, replace the Popover with a collapsible panel/section that does not auto-dismiss (simpler approach). However, keeping the Popover is preferred for design consistency -- just prevent premature closing.

**Recommended approach:** Add `onInteractOutside` handler to `PopoverContent` that calls `event.preventDefault()` when the interaction target is inside a Radix Select portal (identifiable by `[data-radix-select-viewport]` or similar selectors). The popover closes only when:
- The user clicks Apply (explicit close)
- The user clicks the Filters button again (toggle)
- The user clicks outside the popover AND outside any Select portals

### 4. Debounced Search Remains Immediate

The search input sits outside the popover and should continue to trigger filtering immediately (or with a debounce). This is a different UX pattern -- text search benefits from instant feedback, while dropdown filters benefit from batch application.

However, if the search input is also moved into the popover (not recommended), it should follow the same draft/apply pattern.

**Keep the current behavior:** Search input stays outside the popover and triggers filtering on change (with an added debounce of ~300ms to avoid excessive requests while typing).

### 5. URL Parameter Sync (Optional Enhancement)

Persist applied filters to URL search params so that:
- Filters survive page refresh
- Filters can be shared via URL
- Browser back/forward works with filter changes

Mapping:
```
?search=coffee
&accountId=3
&categoryId=7
&budgetId=12
&type=DEBIT
&status=PENDING
&dateFrom=2026-01-01
&dateTo=2026-01-31
```

Use `useSearchParams` from `next/navigation` to read initial filters and `router.replace` (not push, to avoid polluting history on every apply) to update them.

**This is optional for the initial implementation** and can be a follow-up task. The core value is the draft/apply pattern.

### 6. Visual Indicators for Pending Changes

When `draftFilters` differs from `appliedFilters`:
- Show a subtle indicator on the Filters button (e.g., a small dot or different badge color)
- The Apply button should be visually prominent (primary variant)
- When draft matches applied, Apply button should be disabled or secondary

Add a helper:
```typescript
function hasUnappliedChanges(draft: TransactionFilters, applied: TransactionFilters): boolean {
  return JSON.stringify(draft) !== JSON.stringify(applied);
}
```

## Files to Modify

### Primary Changes

| File | Change |
|------|--------|
| `web/src/components/transactions/transactions-table.tsx` | Split filter state into draft/applied; add Apply/Reset handlers; update `TransactionFiltersBar` props and internal logic; add debounce for search input; prevent popover auto-close on Select interaction |

### E2E Test Updates

| File | Change |
|------|--------|
| `e2e/pages/TransactionsPage.ts` | Update filter methods to click Apply button after setting filters; add `applyFilters()` method; update `filterByStatus()`, `filterByAccount()`, etc. to work with new flow |
| `e2e/tests/transactions/verify-transaction.spec.ts` | Update `filterByStatus` call to account for Apply button (handled by page object update) |

### Optional / Follow-up

| File | Change |
|------|--------|
| `web/src/components/transactions/transactions-table.tsx` | Add URL search param sync with `useSearchParams` |
| `web/src/components/ui/popover.tsx` | Potentially add `onInteractOutside` prop forwarding if not already exposed |

## Implementation Steps

1. **Add debounce to search input** -- Install or implement a simple `useDebouncedValue` hook. Apply 300ms debounce to the search filter so it does not fire on every keystroke. This is independent of the apply button and improves UX regardless.

2. **Split filter state** -- In `TransactionsTable`, introduce `draftFilters` and `appliedFilters`. Wire `useQuery` to `appliedFilters`. Wire `TransactionFiltersBar` to `draftFilters`.

3. **Add Apply/Reset buttons** -- Add a footer to the filter popover with Apply and Reset buttons. Apply copies draft to applied and closes popover. Reset clears draft to `emptyFilters`.

4. **Sync draft with applied on popover open** -- When the popover opens, initialize `draftFilters` from `appliedFilters` so the user sees what is currently applied. This prevents stale draft state.

5. **Fix popover closing on Select interaction** -- Add `onInteractOutside` handler to `PopoverContent` that prevents closing when the user is interacting with a Select dropdown portal.

6. **Update Clear Filters button** -- The external "Clear" button should reset both `appliedFilters` and `draftFilters` to `emptyFilters` and trigger a refetch.

7. **Update E2E page object** -- Add `applyFilters()` method to `TransactionsPage`. Update all `filterBy*` methods to include clicking Apply. Update the E2E test.

8. **Add `data-qa` attributes** -- Add `data-qa="btn-apply-filters"` and `data-qa="btn-reset-filters"` to the new buttons.

9. **(Optional) URL param sync** -- Read initial filters from `useSearchParams` on mount. Update URL with `router.replace` on Apply.

## Testing Considerations

### Unit/Component Tests
- Verify that changing draft filters does not trigger a query (mock Apollo and assert no refetch)
- Verify that clicking Apply copies draft to applied and triggers a query
- Verify that Reset clears draft but does not affect applied
- Verify that opening the popover syncs draft from applied

### E2E Tests
- Update existing verify-transaction test (uses `filterByStatus`)
- Add new test: set multiple filters, click Apply, verify filtered results
- Add new test: set filters, click Reset, verify draft cleared
- Add new test: set filters without applying, close popover, reopen -- verify draft synced from applied (not from previous draft)

## Design Notes

- The Apply/Reset footer should use `sticky` positioning within the popover so it remains visible if the filter list grows.
- Consider using a `Separator` above the buttons for visual clarity.
- The Apply button should use the `default` (primary) variant when there are unapplied changes and `outline` or `secondary` when draft matches applied.
- Reset button should always use `ghost` or `outline` variant.
- Badge on the Filters button should continue to show the count of **applied** filters (not draft).
