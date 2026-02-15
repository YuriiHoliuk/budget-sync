# Learnings

## URL Params & Navigation (2026-02-15)
- React Compiler (eslint `react-hooks/preserve-manual-memoization`) disallows `useMemo(() => ..., [])` with empty deps when there's a dependency. Use `useState(() => ...)` lazy initializer instead.
- React Compiler `react-hooks/refs` rule forbids reading `ref.current` during render (e.g. as `useState` initial value). Use inline computation or lazy initializer instead.
- `useSearchParams()` requires `Suspense` boundary in Next.js 14+ to prevent hydration issues.
- `getDateRangeFromMonth()` extracted to `web/src/lib/url-utils.ts` — shared between budget page and transactions URL builder.
- `buildTransactionsUrl()` and `parseTransactionFiltersFromParams()` in `web/src/lib/url-utils.ts` — for constructing/parsing transaction filter URLs.

## UI Fixes (2026-02-15)
- `MonthProvider` in `use-month.tsx` uses `useParams` for URL-based month on budgets page. Non-budget pages need `overrideMonth` state to change month without navigation.
- Budget filter dropdowns use `activeOnly` param. `activeOnly: true` excludes expired (past endDate) budgets — use `false` for filter dropdowns where expired budgets may still have transactions.
- Pre-commit hooks run lint-staged, typecheck, and unit tests automatically.
- Dev credentials: `test@example.com` / `password123` (from web/.env.local).
