# Fix Transactions Page Layout

## Context

The transactions page has broken layout after sticky header/filter sidebar work. The root cause: `<main>` is the scroll container (`overflow-y-auto`), so the entire page (title, table, filters, pagination) scrolls as one unit. This causes: (1) transparent gap between app header and sticky table header, (2) pagination floating over rows, (3) filter sidebar looking like a floating card instead of a structural panel. The fix makes the table scroll independently within a constrained layout.

## Approach

**Key insight**: Keep `<main>` unchanged (`overflow-y-auto p-4 md:p-6`). The transactions page uses `h-full` to fill main's content box exactly — so main never scrolls. The table gets its own scroll container internally. No changes needed to app-shell or other pages.

## Files to Change

### 1. `web/src/app/transactions/page.tsx`

Change wrapper from `space-y-6` to `flex h-full flex-col`. Title gets `shrink-0 pb-6`.

```tsx
<div className="flex h-full flex-col">
  <div className="shrink-0 pb-6">
    <h1 ...>Transactions</h1>
    <p ...>Browse and manage...</p>
  </div>
  <Suspense>
    <TransactionsTable />
  </Suspense>
</div>
```

### 2. `web/src/components/transactions/transactions-table.tsx`

**Main layout** — restructure the return JSX:

```tsx
<>
  <div className="flex min-h-0 flex-1 gap-6">
    {/* Table column */}
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Mobile filter button — shrink-0 lg:hidden */}

      {transactions.length === 0 ? (
        {/* Empty state — flex flex-1 items-center justify-center */}
      ) : (
        <>
          {/* Table scroll area */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
            <Table>...</Table>
          </div>
          {/* Pagination — no longer sticky, naturally at bottom */}
          <TransactionPagination ... />
        </>
      )}
    </div>

    {/* Filter sidebar — structural panel, not a card */}
    <aside className="hidden w-[260px] shrink-0 self-stretch overflow-y-auto border-l pl-6 lg:block">
      <TransactionFiltersSidebar {...sidebarProps} />
    </aside>
  </div>

  <Sheet>...</Sheet>
  <TransactionDetailPanel />
</>
```

**TransactionPagination** (line ~698) — remove sticky, add shrink-0:
- Before: `sticky bottom-0 z-10 flex items-center justify-between border-t bg-background py-3 ...`
- After: `flex shrink-0 items-center justify-between border-t bg-background py-3 ...`

**TransactionsTableSkeleton** — adapt to flex layout:
- Root: `flex min-h-0 flex-1 flex-col gap-4` (instead of `space-y-4`)
- Top bar: add `shrink-0`
- Table skeleton area: `min-h-0 flex-1 overflow-hidden rounded-xl border`

**Error state** — adapt to flex layout:
- Root: add `flex min-h-0 flex-1 items-center justify-center`, remove `p-8 text-center`

**Empty state** — adapt to flex layout:
- Root: `flex flex-1 items-center justify-center rounded-xl border border-dashed`

### No changes needed

- `web/src/components/app-shell.tsx` — `<main>` stays as-is
- `web/src/components/ui/table.tsx` — `sticky top-0` on TableHead now works correctly because the scroll container is the table's direct wrapper
- Other pages (accounts, budgets, categories, settings) — unaffected
- E2E tests — all `data-qa` attributes preserved

## Why This Works

1. **`h-full` on page wrapper** fills main's content box (main height - padding). Content fits exactly, so main doesn't scroll.
2. **`overflow-y-auto` on table wrapper** makes only the table body scroll. Sticky `top-0` on TableHead sticks to this container — no gap.
3. **Pagination outside scroll area** — naturally positioned at bottom of flex column, no sticky needed.
4. **Filter sidebar** with `self-stretch overflow-y-auto border-l` — full-height structural panel with own internal scroll, not a floating card.

## Verification

1. `just dev` — start full stack
2. Navigate to `/transactions`
3. Verify: table scrolls independently, header sticks flush at top of table area
4. Verify: pagination stays fixed at bottom, not floating
5. Verify: filter sidebar fills full height, scrolls internally if viewport is short
6. Verify: mobile layout works (filter button + sheet)
7. Navigate to other pages (budgets, accounts) — verify they scroll normally
8. `just test-e2e` — verify no regressions
