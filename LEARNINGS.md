# Learnings

## URL Params & Navigation (2026-02-15)
- React Compiler (eslint `react-hooks/preserve-manual-memoization`) disallows `useMemo(() => ..., [])` with empty deps when there's a dependency. Use `useState(() => ...)` lazy initializer instead.
- React Compiler `react-hooks/refs` rule forbids reading `ref.current` during render (e.g. as `useState` initial value). Use inline computation or lazy initializer instead.
- `useSearchParams()` requires `Suspense` boundary in Next.js 14+ to prevent hydration issues.
- `getDateRangeFromMonth()` extracted to `web/src/lib/url-utils.ts` — shared between budget page and transactions URL builder.
- `buildTransactionsUrl()` and `parseTransactionFiltersFromParams()` in `web/src/lib/url-utils.ts` — for constructing/parsing transaction filter URLs.

## Filter State Pattern (2026-02-20)
- React Compiler `react-hooks/set-state-in-effect` rule forbids `setState` inside `useEffect`. Use the "previous value" render-time comparison pattern instead: track `prevValue` in state, compare on render, call `setState` during render (not in effect).
- Transaction filters use draft/applied split: `draftFilters` for sidebar UI, `appliedFilters` for query + URL. Apply button copies draft → applied.
- `useDebouncedValue` hook at `web/src/hooks/use-debounced-value.ts` — generic debounce for any value.
- E2E filter methods (`filterByStatus`, etc.) now include `applyFilters()` call. Search includes 400ms wait for debounce.

## UI Fixes (2026-02-15)
- `MonthProvider` in `use-month.tsx` uses `useParams` for URL-based month on budgets page. Non-budget pages need `overrideMonth` state to change month without navigation.
- Budget filter dropdowns use `activeOnly` param. `activeOnly: true` excludes expired (past endDate) budgets — use `false` for filter dropdowns where expired budgets may still have transactions.
- Pre-commit hooks run lint-staged, typecheck, and unit tests automatically.
- Dev credentials: `test@example.com` / `password123` (from web/.env.local).
