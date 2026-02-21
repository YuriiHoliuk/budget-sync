# Learnings

## URL Params & Navigation (2026-02-15)
- React Compiler (eslint `react-hooks/preserve-manual-memoization`) disallows `useMemo(() => ..., [])` with empty deps when there's a dependency. Use `useState(() => ...)` lazy initializer instead.
- React Compiler `react-hooks/refs` rule forbids reading `ref.current` during render (e.g. as `useState` initial value). Use inline computation or lazy initializer instead.
- `useSearchParams()` requires `Suspense` boundary in Next.js 14+ to prevent hydration issues.
- `getDateRangeFromMonth()` extracted to `web/src/lib/url-utils.ts` — shared between budget page and transactions URL builder.
- `buildTransactionsUrl()` and `parseTransactionFiltersFromParams()` in `web/src/lib/url-utils.ts` — for constructing/parsing transaction filter URLs.

## URL Entity Selection (2026-02-21)
- Transaction selection uses `transactionId` search param — synced via the existing `filtersToUrlParams`/URL sync effect.
- Budget edit selection uses `budgetId` search param — synced imperatively in handlers (not via effect) to avoid React Compiler `set-state-in-effect` issues.
- BudgetTable now uses `useSearchParams()` — requires `Suspense` wrapper in budget page.tsx.

## Filter State Pattern (2026-02-20)
- React Compiler `react-hooks/set-state-in-effect` rule forbids `setState` inside `useEffect`. Use the "previous value" render-time comparison pattern instead: track `prevValue` in state, compare on render, call `setState` during render (not in effect).
- Transaction filters use draft/applied split: `draftFilters` for sidebar UI, `appliedFilters` for query + URL. Apply button copies draft → applied.
- `useDebouncedValue` hook at `web/src/hooks/use-debounced-value.ts` — generic debounce for any value.
- E2E filter methods (`filterByStatus`, etc.) now include `applyFilters()` call. Search includes 400ms wait for debounce.

## E2E Testing (2026-02-20)
- After adding new npm dependencies to `web/`, rebuild the E2E web Docker image with `docker compose -f docker-compose.e2e.yml build --no-cache web-e2e` — the cached image won't have new dependencies.
- E2E test `data-qa` selectors for rules: `rules-section-categorization`, `rules-section-budgetization`, `btn-add-rule`, `btn-rule-actions`, `btn-edit-rule`, `btn-delete-rule`, `sheet-create-rule`, `sheet-edit-rule`, `dialog-delete-rule`, `input-rule-text`, `input-rule-priority`, `btn-rule-submit`, `btn-rule-cancel`, `btn-delete-confirm`, `btn-delete-cancel`.

## UI Fixes (2026-02-15)
- `MonthProvider` in `use-month.tsx` uses `useParams` for URL-based month on budgets page. Non-budget pages need `overrideMonth` state to change month without navigation.
- Budget filter dropdowns use `activeOnly` param. `activeOnly: true` excludes expired (past endDate) budgets — use `false` for filter dropdowns where expired budgets may still have transactions.
- Pre-commit hooks run lint-staged, typecheck, and unit tests automatically.
- Dev credentials: `test@example.com` / `password123` (from web/.env.local).
