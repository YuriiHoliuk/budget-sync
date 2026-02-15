# Transaction Pagination Improvements

## Goal

1. Increase the number of transactions loaded per page (currently 25, backend default is 50).
2. Persist pagination state in the URL so that refreshing or navigating back preserves the current page.

---

## Current Implementation

### Frontend (Client)

**File:** `web/src/components/transactions/transactions-table.tsx`

- `PAGE_SIZE` is hardcoded to `25` (line 64).
- Pagination state is managed via React `useState`: `const [page, setPage] = useState(0)` (line 179).
- The page index is zero-based. The GraphQL query is called with `{ limit: PAGE_SIZE, offset: page * PAGE_SIZE }`.
- The `TransactionPagination` component renders Previous/Next buttons and a "Page X of Y" display.
- Changing filters resets page to 0 (`setPage(0)` in `handleFilterChange` and `handleClearFilters`).
- **No URL parameter handling exists.** Pagination state is lost on refresh or navigation.

**File:** `web/src/app/transactions/page.tsx`

- Simple page component that renders `<TransactionsTable />` as a client component (`"use client"`).
- Does not accept or pass `searchParams`.

### Backend (Server)

**File:** `src/presentation/graphql/resolvers/transactionsResolver.ts`

- `DEFAULT_LIMIT = 50`, `MAX_LIMIT = 200` (lines 73-74).
- `resolvePagination()` clamps limit to `MAX_LIMIT` and defaults offset to 0.
- Uses offset-based pagination (not cursor-based).

**File:** `src/presentation/graphql/schema/transactions.graphql`

- `PaginationInput { limit: Int, offset: Int }` -- server defaults limit to 50 if omitted.
- `TransactionConnection { items, totalCount, hasMore }` -- provides all data needed for page-based navigation.

**File:** `src/infrastructure/repositories/database/DatabaseTransactionRepository.ts`

- `findRecordsFiltered()` applies `LIMIT` and `OFFSET` to SQL query, orders by `date DESC, id DESC`.
- `countFiltered()` returns total count for the same filter conditions.
- No additional limits beyond what the resolver passes.

### E2E Test Page Object

**File:** `e2e/pages/TransactionsPage.ts`

- Has pagination helpers: `nextPage()`, `prevPage()`, `getCurrentPage()`, `hasNextPage()`, `hasPrevPage()`.
- Uses `data-qa` attributes for selectors: `btn-pagination-previous`, `btn-pagination-next`, `text-pagination-page`, `text-pagination-info`.

### Existing URL Param Patterns in the App

**File:** `web/src/hooks/use-month.tsx`

- Uses `useParams()` and `useRouter()` from `next/navigation` for the budget month (path-based: `/budgets/[month]`).
- This is a path segment pattern, not a query parameter pattern. For pagination, query parameters (`?page=2`) are more appropriate since pagination is not the primary resource identifier.

---

## Proposed Changes

### 1. Increase Page Size

**Change `PAGE_SIZE` from 25 to 50.**

- The backend default is already 50, and `MAX_LIMIT` is 200, so 50 is well within bounds.
- 50 rows is a reasonable default for a financial transactions table -- users see more data without scrolling endlessly, and the data payload is modest (each transaction row is lightweight).
- If needed in the future, this could become a user-configurable setting (e.g., 25/50/100 via a selector in the pagination bar), but that is out of scope for this task.

**File to modify:** `web/src/components/transactions/transactions-table.tsx`
- Change line 64: `const PAGE_SIZE = 25;` to `const PAGE_SIZE = 50;`

### 2. Add Page Number to URL

Use Next.js `useSearchParams` and `useRouter` to sync the `page` query parameter with the pagination state. The URL will look like `/transactions?page=2`.

#### 2a. Convert Transactions Page to Accept Search Params

**File:** `web/src/app/transactions/page.tsx`

The page is already `"use client"`, so it can use `useSearchParams()` directly. However, the pagination logic lives inside `TransactionsTable`, not the page component. There are two approaches:

**Approach A (Recommended): Lift URL sync into TransactionsTable**

Keep the current component structure. Inside `TransactionsTable`, use `useSearchParams()` and `useRouter()` to read and write the `page` param. This avoids prop drilling and keeps the component self-contained.

```tsx
// In TransactionsTable:
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

// Read initial page from URL
const pageFromUrl = Number(searchParams.get("page") ?? "1");
const initialPage = Number.isFinite(pageFromUrl) && pageFromUrl >= 1 ? pageFromUrl - 1 : 0;

const [page, setPage] = useState(initialPage);

// Sync page changes to URL
const handlePageChange = useCallback((newPage: number) => {
  setPage(newPage);
  const params = new URLSearchParams(searchParams.toString());
  if (newPage === 0) {
    params.delete("page");
  } else {
    params.set("page", String(newPage + 1)); // URL is 1-based
  }
  const query = params.toString();
  router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
}, [searchParams, router, pathname]);
```

**Approach B (Alternative): Pass page as prop from page.tsx**

Read `searchParams` in `page.tsx` and pass `initialPage` as a prop to `TransactionsTable`. This separates concerns but requires interface changes.

**Recommendation:** Approach A is simpler and maintains the current component structure. The `TransactionsTable` already owns all pagination logic, so it is natural for it to also own URL synchronization.

#### 2b. Update Page Change Handlers

**File:** `web/src/components/transactions/transactions-table.tsx`

Replace direct `setPage` calls with the new `handlePageChange` function:

1. Replace `onPageChange={setPage}` with `onPageChange={handlePageChange}` in the `TransactionPagination` component (line 340).
2. In `handleFilterChange` and `handleClearFilters`, call `handlePageChange(0)` instead of `setPage(0)` so the URL is also cleared when filters reset.

#### 2c. Handle Edge Cases

- **Invalid page values:** If `?page=abc` or `?page=-1` or `?page=999` (beyond total pages), fall back to page 0 (first page). The component already handles this gracefully since Apollo will just return fewer/no results, and the pagination UI will show the correct state.
- **Page 1 = no param:** When on page 1, remove the `page` param from the URL to keep URLs clean. `/transactions` and `/transactions?page=1` should be equivalent.
- **SSR/Hydration:** Since this is a `"use client"` component, `useSearchParams()` is fine. It may show a brief flash if the initial render does not match the URL, but for pagination this is acceptable. Wrapping the page in `Suspense` at the layout level (which Next.js recommends for `useSearchParams`) will prevent hydration issues.

#### 2d. Suspense Boundary

Next.js 14+ recommends wrapping components that use `useSearchParams()` in a `Suspense` boundary to prevent the entire page from being client-rendered. Update the page component:

**File:** `web/src/app/transactions/page.tsx`

```tsx
import { Suspense } from "react";
import { TransactionsTable } from "@/components/transactions/transactions-table";

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and manage your financial transactions.
        </p>
      </div>
      <Suspense>
        <TransactionsTable />
      </Suspense>
    </div>
  );
}
```

### 3. Pagination UX (No Changes Needed)

The current pagination approach -- traditional page-based with Previous/Next buttons -- is appropriate for this use case. "Load more" (infinite scroll) would be worse here because:

- Users need to jump to specific pages for review workflows (e.g., going back to verify older transactions).
- The table header and filter bar should remain visible.
- URL-based state preservation is straightforward with page numbers.
- Total count display ("Showing 1-50 of 342") gives users a clear sense of scope.

No changes to the pagination UI component are needed beyond wiring up the URL sync.

### 4. Future Consideration: Filters in URL

While out of scope for this task, a natural follow-up would be persisting filter state in the URL as well (e.g., `?page=2&account=3&status=PENDING`). This would allow sharing filtered views and preserving filter state across navigation. The same `useSearchParams` pattern would apply.

---

## Files to Modify

| File | Changes |
|------|---------|
| `web/src/components/transactions/transactions-table.tsx` | Increase `PAGE_SIZE` to 50. Add `useSearchParams`/`useRouter`/`usePathname` imports. Read initial page from URL. Create `handlePageChange` that updates both state and URL. Replace `setPage` calls. |
| `web/src/app/transactions/page.tsx` | Wrap `TransactionsTable` in `Suspense` boundary. |
| `e2e/pages/TransactionsPage.ts` | Update `url` getter if E2E tests need to navigate to specific pages (e.g., `/transactions?page=2`). Add `gotoPage(n)` helper. |
| `e2e/tests/transactions/verify-transaction.spec.ts` | May need minor updates if page size change affects which transactions appear on first page. |

**No backend changes required.** The server already supports offset-based pagination with configurable limit (up to 200).

---

## Testing Plan

### Unit Tests
- No new unit tests needed (pagination logic is UI state management, not business logic).

### API Integration Tests
- Existing `transactions-query.test.ts` already covers pagination with limit/offset. No changes needed.

### E2E Tests
- Update existing verify-transaction E2E test if page size change affects it.
- Consider adding a new E2E test: navigate to `/transactions?page=2`, verify page 2 is displayed, refresh and verify state is preserved.

---

## Implementation Order

1. Increase `PAGE_SIZE` from 25 to 50 (trivial, one-line change).
2. Add URL sync for page parameter in `TransactionsTable`.
3. Add `Suspense` wrapper in `page.tsx`.
4. Update E2E page object with `gotoPage()` helper.
5. Run `just check` and `just test` to verify.
6. Run `just test-e2e` to verify E2E tests pass.
