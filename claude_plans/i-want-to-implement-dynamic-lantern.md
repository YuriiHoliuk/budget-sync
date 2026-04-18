# Batch Transaction Editing

## Context

Today, editing a transaction's category, budget, or verification status is one-by-one (inline comboboxes in the table, or the detail sheet). When triaging a large batch of synced transactions — e.g. 30 Silpo runs that all belong to "Groceries" / "Monthly Food" budget — the user must click each row individually. This plan introduces multi-select plus a batch action bar to change **category**, **budget**, or **verify** for all selected transactions in one shot.

The existing "mark as returning" flow (`returning-selection-banner.tsx`, `MarkAsReturning` use case) is the closest precedent. We'll reuse its visual language and mutation patterns but keep the two modes disjoint (selection for batch-edit ≠ selection for mark-as-returning).

---

## UX

**Selection entry points** (both work, complement each other):
- **Checkbox column** — a new first column in the table with a checkbox per row, plus a header checkbox that toggles select-all on the current page. Always visible; selection is the primary entry point.
- **Shift-click** on desktop — shift-clicking a row toggles its checkbox without entering inline edit. Good for power users.
- **Long-press** on mobile — pressing and holding a row for ~500ms toggles its checkbox. Good when thumbs are the primary input.

Selection is persistent across pagination (in-memory `Set<number>` of ids). The bar shows total count including off-page selections.

**Action bar placement (responsive):**
- **Desktop (`md` and above):** sticky banner above the table, same slot/style as `ReturningSelectionBanner` but with a neutral color to distinguish from the amber returning flow.
- **Mobile (`<md`):** fixed bar at the bottom of the viewport, safe-area aware, above any existing nav.

**Bar contents:**
- Left: `N selected` + a `Clear` link.
- Right (actions):
  - **Category ▾** — opens `CategoryCombobox`; selecting a category applies it to all.
  - **Budget ▾** — opens `BudgetCombobox`; selecting a budget applies it to all.
  - **Verify** — button; applies verified status to all.
  - **✕** close button (same as `Clear`).
- Mobile: actions collapse into a `⋯` overflow menu if the bar gets tight; primary action (Category) stays visible.

**Mutual exclusivity with returning-selection mode:** when returning selection is active, batch checkboxes are hidden/disabled, and vice versa — entering either mode cancels the other.

**Budget dropdown note:** the inline `BudgetCombobox` filters by a single transaction's date. For the batch bar there is no single date — we either (a) show the union of budgets matching *any* selected transaction's date, or (b) show all active budgets with a warning row if a budget doesn't match some selection's date. Go with (a): filter the dropdown to budgets whose date range overlaps with the min/max date of the current selection. Simpler, avoids user confusion. Backend validates per-transaction and can skip (or accept) mismatches — see Backend below.

---

## Backend

New single mutation covering all three actions (category, budget, verify) in one atomic update:

```graphql
input BatchUpdateTransactionsInput {
  ids: [Int!]!
  categoryId: Int          # optional; null is valid (clears category) — use sentinel below
  setCategory: Boolean     # when true, apply categoryId (incl. null) to all
  budgetId: Int
  setBudget: Boolean       # when true, apply budgetId (incl. null) to all
  verify: Boolean          # when true, set categorizationStatus=VERIFIED on all
}

type BatchUpdateTransactionsResult {
  updatedCount: Int!
  transactions: [Transaction!]!
}

extend type Mutation {
  batchUpdateTransactions(input: BatchUpdateTransactionsInput!): BatchUpdateTransactionsResult!
}
```

The `setCategory`/`setBudget` flags distinguish "don't touch this field" from "clear it to null". `verify` is a simple boolean — omitted/false means don't touch.

**Resolver + use case:**
- Add `src/application/use-cases/BatchUpdateTransactions.ts` (new). Mirrors `MarkAsReturning.ts` shape: injected `TransactionRepository`, optionally `CategoryRepository` / `BudgetRepository` for existence validation (same `findById` check used in the single mutations at `transactionsResolver.ts:298-349`). Validates the referenced category/budget exists once (not per id).
- Wire it into `TransactionsResolver` alongside other use cases (`transactionsResolver.ts:112-118`).
- Add repository method `batchUpdate(ids, patch)` on `TransactionRepository` abstract class and implement it in `DatabaseTransactionRepository` as a single `UPDATE ... WHERE id IN (...)` using drizzle's `inArray`. Set `categorizationStatus = 'verified'` whenever category is explicitly set or `verify=true` — matches the single-mutation behavior (see `updateTransactionCategory` resolver, which bumps status implicitly via the repo method).

**Budget-date validation:** skip strict per-transaction date-range checks in the batch use case for simplicity in v1 — the UI already filters the dropdown so this shouldn't happen in practice. If we want stricter safety later, reject the whole batch if any transaction's date falls outside the budget's range.

---

## Files to modify / create

**Backend:**
- `src/presentation/graphql/schema/transactions.graphql` — add mutation + input + result types.
- `src/application/use-cases/BatchUpdateTransactions.ts` — new use case (follow `MarkAsReturning.ts` pattern).
- `src/domain/repositories/TransactionRepository.ts` (or wherever the abstract lives) — add `batchUpdate` abstract method.
- `src/infrastructure/.../DatabaseTransactionRepository.ts` — implement `batchUpdate` with `inArray`.
- `src/presentation/graphql/resolvers/transactionsResolver.ts` — inject use case, wire resolver.
- `src/main.ts` / DI container — register `BatchUpdateTransactionsUseCase` (follow pattern used for `MarkAsReturningUseCase`).
- `tests/integration/api/batch-update-transactions.test.ts` — new; covers happy path per-field, combined fields, null clears, non-existent id, non-existent category/budget, empty ids array.

**Frontend:**
- `web/src/graphql/mutations/transactions.graphql` — add `BatchUpdateTransactions` mutation.
- `web/src/components/transactions/batch-edit-bar.tsx` — new. Responsive top/bottom bar with category/budget/verify actions. Reuses `CategoryCombobox`, `BudgetCombobox`, `Button`.
- `web/src/components/transactions/transactions-table.tsx` — main integration:
  - Add `selectedIds: Set<number>` state (persists across pagination).
  - Add checkbox column (reuse ShadCN `Checkbox` — install if not present).
  - Add shift-click handler on row click (detect `e.shiftKey`, toggle instead of opening detail).
  - Add long-press detection on mobile (500ms `pointerdown` timer, cancel on `pointermove`/`pointerup`).
  - Render `<BatchEditBar>` above the table (desktop) and `fixed bottom-0` (mobile) via Tailwind responsive classes (`md:relative md:top-auto` etc.).
  - On batch mutation success, update Apollo cache (updated transactions come back in response and normalize automatically; call `invalidateBudgetRelatedCache` when budget changes).
  - Guard against interaction with returning-selection mode (cancel one when entering the other).
- `web/src/components/ui/checkbox.tsx` — install ShadCN checkbox if missing.
- `e2e/tests/transactions/batch-edit.spec.ts` — new E2E covering select→change category, cross-page selection, verify flow. Follow patterns in existing `e2e/tests/transactions/`.

**Docs:**
- `docs/frontend-architecture.md` — mention batch selection pattern + bar component if this doc covers interactions.
- Update `scripts/seed-local-db.ts` if helpful to seed enough uncategorized transactions for demoing.

## Reusable pieces (don't rewrite)

- `CategoryCombobox` (`web/src/components/categories/category-combobox.tsx`) — take `value`, `onValueChange`, `allowNone`.
- `BudgetCombobox` (`web/src/components/budget/budget-combobox.tsx`) — same interface; pre-filter budgets by overlap with selection's date range.
- `invalidateBudgetRelatedCache` (`web/src/lib/cache-utils`) — call in mutation `update` when budget changes.
- `mapTransactionRecordToGql` (`src/presentation/graphql/mappers/transaction.ts`) — use in resolver to map result rows.
- `Checkbox` ShadCN primitive — for the column and header.
- Tailwind `md:` breakpoint — project already uses `lg:hidden` etc. for mobile filter sheet; same convention.

## Verification

1. **Unit tests** — `bun test` (via `just test`). Cover `BatchUpdateTransactions` use case with mocked repositories: all fields vs single field, invalid category/budget, empty ids.
2. **API integration tests** — `just test-api-file tests/integration/api/batch-update-transactions.test.ts`. Seeds transactions, runs the mutation, asserts row state via the test harness.
3. **Typecheck + lint** — `just check`.
4. **Local dev** — `just dev`, go to `/transactions`, verify:
   - Checkbox column appears; select-all on header works per-page.
   - Shift-click on desktop toggles selection without opening detail.
   - Long-press on mobile (Chrome devtools mobile emulation) toggles selection.
   - Batch bar shows correct count across pagination.
   - Changing category via bar updates all selected rows; changing budget same; Verify bumps status.
   - Returning-selection and batch-edit can't be active simultaneously.
5. **E2E** — `just test-e2e-file e2e/tests/transactions/batch-edit.spec.ts`.
6. **Regression spot-check** — run the existing mark-as-returning E2E to confirm we didn't break the precedent flow (`e2e/tests/transactions/mark-as-returning.spec.ts` or similar).
