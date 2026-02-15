# Transaction Filters: Move to Always-Visible Right Sidebar

## Current Implementation Analysis

### How Filters Work Today

The transactions page (`web/src/app/transactions/page.tsx`) renders a simple layout: a heading plus the `TransactionsTable` component. All filter logic lives inside `TransactionsTable` (`web/src/components/transactions/transactions-table.tsx`), which is a large monolithic component (~838 lines) containing:

1. **Search bar** -- An `Input` field with a search icon, always visible in the toolbar.
2. **Filter popover** -- A `Popover` (ShadCN) triggered by a "Filters" button. When clicked, it opens a dropdown panel containing:
   - Account select (dropdown)
   - Category select (dropdown)
   - Budget select (dropdown)
   - Type select (Expense/Income)
   - Status select (Pending/Categorized/Verified)
   - Date range (From/To date inputs)
3. **Active filter count badge** -- Shows on the Filters button when filters are active.
4. **Clear filters button** -- Appears when filters are active.

### Filter State

Filter state is managed locally in `TransactionsTable` via `useState<TransactionFilters>`. The `TransactionFilters` interface contains:
- `search: string`
- `accountId: number | null`
- `categoryId: number | null`
- `budgetId: number | null`
- `type: TransactionTypeEnum | null`
- `status: CategorizationStatusEnum | null`
- `dateFrom: string`
- `dateTo: string`

Filter state is converted to GraphQL variables via `filtersToGraphQL()` and passed to the `GetTransactionsDocument` query.

### Current Layout Structure

```
AppShell
  SidebarProvider
    AppSidebar (left, nav)
    SidebarInset
      AppHeader (sticky top bar)
      <main className="flex-1 overflow-auto p-4 md:p-6">
        TransactionsPage
          TransactionsTable
            TransactionFiltersBar (search + popover button)
            Table
            Pagination
          TransactionDetailPanel (Sheet, right slide-in overlay)
```

Key observations:
- The left navigation sidebar already uses ShadCN's `Sidebar` component with `SidebarProvider`.
- The `TransactionDetailPanel` already uses a right-side `Sheet` (overlay panel) for viewing transaction details.
- The main content area is `<main className="flex-1 overflow-auto p-4 md:p-6">` inside `SidebarInset`.
- There is no right sidebar anywhere in the app currently.

### E2E Test Impact

The `TransactionsPage` page object (`e2e/pages/TransactionsPage.ts`) interacts with filters through:
- `openFilters()` -- clicks the popover trigger button (`btn-filters`)
- `filterByAccount()`, `filterByCategory()`, `filterByBudget()`, `filterByType()`, `filterByStatus()` -- all open the popover first, then interact with selects
- `clearFilters()` -- clicks the clear button
- `getActiveFilterCount()` -- reads the badge

These methods will need updating since filters will no longer be behind a popover.

---

## Proposed Layout Changes

### Desktop Layout (md and above)

The transactions page will use a two-column layout: the main content (table + pagination) on the left, and a persistent filter sidebar on the right.

```
+------------------+-------------------------------+------------------+
|                  |           AppHeader           |                  |
|    Left Nav      +-------------------------------+  Right Filter    |
|    Sidebar       |                               |  Sidebar         |
|    (existing)    |   Transactions Table          |  (new, ~280px)   |
|                  |   + Pagination                |                  |
|                  |                               |  - Search        |
|                  |                               |  - Account       |
|                  |                               |  - Category      |
|                  |                               |  - Budget        |
|                  |                               |  - Type          |
|                  |                               |  - Status        |
|                  |                               |  - Date Range    |
|                  |                               |  - Clear All     |
+------------------+-------------------------------+------------------+
```

The filter sidebar will:
- Be a fixed-width panel (~280px) on the right side of the transactions page content area.
- Always be visible on desktop (no toggle/collapse).
- Have a sticky position so it stays visible when the table scrolls vertically.
- Include a header ("Filters") with the active filter count and a clear-all button.

### Mobile Layout (below md breakpoint)

On mobile, the right sidebar does not make sense since horizontal space is very limited. Two options:

**Option A (recommended): Collapsible Sheet**
Keep the current popover/sheet behavior on mobile. The filter sidebar becomes a bottom or right Sheet that slides in when tapping a filter button. This is the standard mobile pattern.

**Option B: Stacked layout**
Show filters above the table in a collapsible accordion. Less ideal because it pushes the table down.

Recommendation: **Option A** -- Use the same filter component internally, but wrap it in a `Sheet` on mobile and render it inline on desktop. The `useIsMobile()` hook from `web/src/hooks/use-mobile.ts` already exists for this pattern (used by the left sidebar).

### Interaction with TransactionDetailPanel

The `TransactionDetailPanel` is currently a right-side `Sheet` overlay. When the filter sidebar is always visible, clicking a transaction should still open the detail panel as an overlay on top of everything (it uses a `Sheet` with `z-50`). No conflict -- the Sheet overlays the entire viewport with a backdrop.

---

## Component Restructuring

### New Components

1. **`web/src/components/transactions/transaction-filters-sidebar.tsx`**
   - Extracted from the current `TransactionFiltersBar` in `transactions-table.tsx`.
   - Renders the full set of filter controls vertically (not in a popover).
   - Includes a header with "Filters" title, active count badge, and "Clear all" button.
   - Accepts the same props as `TransactionFiltersBar` currently does.
   - On desktop: rendered directly in the layout.
   - On mobile: rendered inside a `Sheet` component.

2. **`web/src/components/transactions/transaction-filters-sheet.tsx`** (optional -- could be inline)
   - Mobile wrapper that renders `TransactionFiltersSidebar` content inside a `Sheet`.
   - Triggered by a filter button in the toolbar area.

### Modified Components

1. **`web/src/components/transactions/transactions-table.tsx`**
   - Remove the `TransactionFiltersBar` component (extract to new file).
   - Lift filter state up to the parent page or keep it here but pass the filter UI component rendering responsibility to the page layout.
   - The search bar can remain at the top of the table (above the table, inline with the content) or move into the sidebar. **Recommendation**: Move search into the sidebar for consistency -- all filtering in one place.
   - The table and pagination remain here.

2. **`web/src/app/transactions/page.tsx`**
   - Restructure layout to a two-column flex container on desktop.
   - Left column: table content (heading, table, pagination).
   - Right column: filter sidebar (sticky).
   - On mobile: single column with Sheet-based filters.

### State Management Approach

Filter state currently lives in `TransactionsTable`. Two options:

**Option A (minimal change)**: Keep filter state in `TransactionsTable`, pass `filters` and `onFilterChange` down to the sidebar component. The page layout simply positions the sidebar next to the table. Both the table and sidebar are children of `TransactionsTable`.

**Option B (cleaner separation)**: Lift filter state up to `TransactionsPage` (the page component), pass it both to the filter sidebar and the transactions table. This makes the page the orchestrator.

**Recommendation**: Option A for minimal change. The `TransactionsTable` already manages filters, queries, and mutations. We just need to extract the filter UI into a separate component and change how `TransactionsTable` renders its layout.

### Detailed Implementation Plan

#### Step 1: Extract TransactionFiltersSidebar component

Extract the filter controls from `TransactionFiltersBar` into a new `TransactionFiltersSidebar` component that renders all filters vertically in a panel layout (no popover wrapper).

```typescript
// web/src/components/transactions/transaction-filters-sidebar.tsx
interface TransactionFiltersSidebarProps {
  filters: TransactionFilters;
  accounts: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; fullPath: string }>;
  budgets: Array<{ id: number; name: string }>;
  activeFilterCount: number;
  onFilterChange: (key: keyof TransactionFilters, value: string | number | null) => void;
  onClearFilters: () => void;
}
```

The component renders:
- Search input at the top
- Vertical stack of labeled Select controls (Account, Category, Budget, Type, Status)
- Date range inputs (From/To)
- "Clear all filters" button at the bottom (shown when filters are active)

#### Step 2: Update TransactionsTable layout

Modify `TransactionsTable` to render a two-column layout on desktop:

```tsx
return (
  <>
    <div className="flex gap-6">
      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* Table + pagination here */}
      </div>

      {/* Filter sidebar -- desktop only */}
      <aside className="hidden w-[280px] shrink-0 lg:block">
        <div className="sticky top-20">
          <TransactionFiltersSidebar ... />
        </div>
      </aside>
    </div>

    {/* Filter sheet -- mobile only */}
    <div className="lg:hidden">
      {/* Filter button in toolbar + Sheet with filters */}
    </div>

    <TransactionDetailPanel ... />
  </>
);
```

#### Step 3: Mobile filter sheet

On screens smaller than `lg`, show a filter button (similar to current) that opens a `Sheet` containing the same `TransactionFiltersSidebar` content.

#### Step 4: Update E2E page object

Update `TransactionsPage.ts` methods:
- Remove `openFilters()` calls on desktop since filters are always visible.
- Filter-by methods should directly interact with the selects (no popover open step needed).
- On mobile tests, the Sheet-based flow still applies.

#### Step 5: Style refinements

- Add a border-left and subtle background to the filter sidebar for visual separation.
- Match the sidebar styling to the app's design language (use `bg-muted/30` or `bg-card`).
- Ensure proper overflow handling if many categories/budgets exist.
- Add `data-qa` attributes to the new sidebar container.

---

## Files to Create/Modify

### New Files
| File | Description |
|------|-------------|
| `web/src/components/transactions/transaction-filters-sidebar.tsx` | Filter controls rendered as a vertical sidebar panel |

### Modified Files
| File | Change Description |
|------|-------------------|
| `web/src/components/transactions/transactions-table.tsx` | Remove `TransactionFiltersBar`, restructure to two-column layout with sidebar on desktop and Sheet on mobile |
| `web/src/app/transactions/page.tsx` | Minor: may need layout adjustments if filter state is lifted |
| `e2e/pages/TransactionsPage.ts` | Update filter interaction methods (no popover open step) |
| `e2e/tests/transactions/verify-transaction.spec.ts` | Update `filterByStatus` call if method signature changes |
| `docs/frontend-architecture.md` | Document the new sidebar filter pattern |

### Files That Do NOT Need Changes
| File | Reason |
|------|--------|
| `web/src/components/app-shell.tsx` | The right sidebar is page-local, not app-wide |
| `web/src/components/ui/sidebar.tsx` | The existing ShadCN sidebar is for the left nav; the filter sidebar is a simple `<aside>` element |
| `web/src/components/transactions/transaction-detail-panel.tsx` | Sheet overlay is independent of the sidebar layout |
| `web/src/graphql/queries/transactions.graphql` | No query changes needed |

---

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| `< lg` (< 1024px) | Single column, filter button opens Sheet |
| `>= lg` (1024px+) | Two-column, filter sidebar always visible |

The `lg` breakpoint is chosen (instead of `md`) because the transactions table already has many columns and needs horizontal space. With the left nav sidebar (~256px) + filter sidebar (~280px), the table needs at least ~500px to be usable.

---

## Risks and Considerations

1. **Table width compression**: The table has 8 columns. Adding a 280px sidebar on the right reduces available table width. On `lg` screens (1024px) with the left nav collapsed (~48px), the table gets ~696px. With the left nav expanded (~256px), the table gets ~488px which is tight. Mitigation: Use `lg` breakpoint and allow horizontal scroll on the table if needed.

2. **Consistency with other pages**: No other page in the app has a right sidebar. This creates a unique layout pattern for the transactions page only. This is acceptable since transactions is the most filter-heavy page.

3. **E2E test stability**: Changing from popover-based to always-visible filters simplifies E2E tests (fewer clicks, no popover timing issues). The filter selects themselves use the same `data-qa` attributes.

4. **Filter sidebar scroll**: If the filter sidebar content is taller than the viewport (unlikely with current filters, but possible if more are added), the sidebar should scroll independently. Use `overflow-y-auto` and `max-h-[calc(100vh-5rem)]` on the sticky container.
