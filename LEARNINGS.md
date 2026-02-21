# Learnings

## Budget Table Scroll Fix (2026-02-21)
- ShadCN `TableHead` already has `sticky top-0 z-[1] bg-background` built-in — no need to add sticky classes manually.
- For a table to scroll independently, the page must use `flex h-full flex-col` (fill viewport height) and the table wrapper needs `min-h-0 flex-1 overflow-y-auto`.
- `container.local.ts` is a separate DI setup from `container.ts` — adding new gateways to production container doesn't automatically register them for local dev. Always update both.
- Docker dev web container (`docker compose`) caches npm dependencies. After adding new packages to `web/`, restart or rebuild: `docker compose up --build web`.

## Usage Frequency Sorting (2026-02-21)
- Adding new abstract methods to `TransactionRepository` requires stub implementations in `SpreadsheetTransactionRepository` (throws) in addition to `DatabaseTransactionRepository`.
- Biome linter forbids non-null assertions (`!`). Use `for...of` with narrowing guard instead of `.filter().map()` with `!`.
- `BudgetGql` and `CategoryGql` mapper interfaces need default values (e.g., `transactionCount: 0`) in `mapBudgetToGql`/`mapCategoryToGql` since the count is merged at the resolver level, not the mapper level.
- Combobox `transactionCount` prop is optional (`number | undefined`) so existing call sites that don't fetch the field still work.

## Categorization Queue (2026-02-22)
- Push-based Pub/Sub queue only needs `publish()` method — no `pull()`/`acknowledge()` since Pub/Sub pushes to the webhook endpoint.
- `CategorizationQueueGateway` is separate from `MessageQueueGateway` — different topic, different retry policy, publish-only interface.
- `CATEGORIZATION_TOPIC` env var defaults to `categorization-queue`. Infrastructure tasks (CATQ-001, CATQ-007, CATQ-009) still pending for Terraform and docs.
- When removing `private` from a constructor parameter that's only used to pass to another constructor, keep the `@inject()` decorator and the type — just remove `private` so it's a parameter only, not a class property.

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

## Combobox Auto-Open Pattern (2026-02-21)
- `SearchableSelect` supports `defaultOpen` prop — uses `useState(defaultOpen)` so it only applies on mount.
- To auto-open a specific inline combobox when entering edit mode, track `autoOpenField` state alongside `editingTransaction`. Pass `defaultOpen={autoOpenField === "category"}` to the target combobox.
- Transaction dates come as full ISO timestamps from the API (`record.date.toISOString()` in `transaction.ts` mapper), so time formatting is available on the frontend.

## UI Fixes (2026-02-15)
- `MonthProvider` in `use-month.tsx` uses `useParams` for URL-based month on budgets page. Non-budget pages need `overrideMonth` state to change month without navigation.
- Budget filter dropdowns use `activeOnly` param. `activeOnly: true` excludes expired (past endDate) budgets — use `false` for filter dropdowns where expired budgets may still have transactions.
- Pre-commit hooks run lint-staged, typecheck, and unit tests automatically.
- Dev credentials: `test@example.com` / `password123` (from web/.env.local).
