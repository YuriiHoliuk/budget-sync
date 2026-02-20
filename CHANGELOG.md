# Changelog

## 2026-02-20

### Added
- Full CRUD for categorization and budgetization rules (RULES-001 through RULES-009)
  - `Rule` domain entity with validation, priority, timestamps
  - Expanded `CategorizationRuleRepository` and `BudgetizationRuleRepository` with `findAllRules`, `findById`, `save`, `update`, `delete`
  - `CreateRuleUseCase`, `UpdateRuleUseCase`, `DeleteRuleUseCase` (generic, parameterized by repository)
  - GraphQL schema (`rules.graphql`), resolver (`RulesResolver`), and mapper (`mapRuleToGql`)
  - `RuleNotFoundError` domain error
  - Settings page (`/settings`) rewritten with two rule sections (categorization + budgetization)
  - `RulesSection`, `RuleFormSheet`, `DeleteRuleDialog` frontend components with `data-qa` attributes
  - Frontend GraphQL queries/mutations for rules with codegen
  - 20 unit tests (Rule entity + 3 use cases), 8 API integration test files
  - Seed data: 4 categorization rules + 3 budgetization rules for local dev
  - Test helpers: `createTestRule` fixture, updated mock repositories with CRUD methods, `createTestCategorizationRule`/`createTestBudgetizationRule` API test factories

### Added
- Searchable dropdown (combobox) components for budget and category selection (SRCH-001 through SRCH-010)
  - Installed `cmdk` library and created ShadCN `Command` UI component
  - Created generic `SearchableSelect` wrapper (Popover + Command pattern)
  - Created `CategoryCombobox` with hierarchical grouping, rootOnly mode, excludeIds, allowNone/allowAll
  - Created `BudgetCombobox` with showBalance mode, disabledIds, allowNone/allowAll
  - Replaced all budget/category Select dropdowns across the app with searchable comboboxes
  - Updated E2E page objects with `searchAndSelectOption()` method for combobox interactions

### Added
- `updateTransactionNotes` GraphQL mutation for updating transaction notes (NOTES-001)
- Editable notes textarea in transaction detail panel with auto-save on blur and "Saved" indicator (NOTES-002)
- ShadCN Textarea UI component (`web/src/components/ui/textarea.tsx`)
- API integration tests for updateTransactionNotes mutation (NOTES-001)
- `gotoPage(n)` helper to TransactionsPage E2E page object for direct URL-based page navigation (PAG-003)

### Added
- Draft/applied filter pattern for transaction sidebar — filter changes no longer trigger immediate GraphQL refetch (APPLY-002)
- Apply and Reset buttons at bottom of transaction filter sidebar with visual indication of unapplied changes (APPLY-003)
- `useDebouncedValue` hook with 300ms debounce on search input to prevent excessive keystroke-driven updates (APPLY-001)
- Updated E2E page object: `applyFilters()` method, all `filterBy*` methods now include Apply step (APPLY-004)

## 2026-02-15

### Fixed
- Wide tables (budgets, transactions) no longer cause entire page to scroll horizontally — tables now have their own horizontal scroll container (UI-007)
- Main content area constrained with `min-w-0` to prevent flex overflow pushing layout (UI-007)

### Added
- Sticky pagination bar at bottom of transactions view — always visible without scrolling (UI-008)
- Clickable page number selector in transaction pagination with ellipsis pattern (1 ... 4 5 [6] 7 8 ... 12) for quick page navigation (UI-009)

### Changed
- Removed obsolete APPLY-001 to APPLY-005 filter popover tasks, replaced with sidebar-adapted equivalents (APPLY phase now targets sidebar filters)

### Added
- Always-visible transaction filter sidebar on desktop (lg+) with all filters (search, account, category, budget, type, status, date range) rendered vertically (FILT-001, FILT-002)
- Mobile filter Sheet overlay triggered by "Filters" button on smaller screens (FILT-002)
- Prominent blue-styled verify button for AI-categorized transactions in both table and detail panel (UI-006)

### Changed
- Removed popover-based filter UI in favor of persistent sidebar layout (FILT-002)
- Updated E2E TransactionsPage page object to interact with sidebar filters directly without popover (FILT-003)

### Fixed
- Added horizontal padding and bottom padding to transaction detail panel body content (UI-005)

### Added
- Budget names in budget table are clickable links to filtered transactions view (NAV-002)
- "View Transactions" item in budget row dropdown menu (NAV-002)
- Transaction filters and pagination synced to URL search params — shareable and bookmarkable (NAV-001, NAV-003, PAG-002)
- Shared URL utilities: `getDateRangeFromMonth()`, `buildTransactionsUrl()`, `parseTransactionFiltersFromParams()` in `web/src/lib/url-utils.ts` (NAV-001)
- Suspense boundary around TransactionsTable for `useSearchParams()` compatibility (PAG-002)
- Sticky budget table header so column names remain visible when scrolling (UI-001)

### Changed
- Increased transaction page size from 25 to 50 (PAG-001)

### Fixed
- Budget progress bar now shows red only when overspent (available < 0), not at exactly 100% usage (UI-002)
- Month selector on transactions page no longer redirects to budgets page (UI-003)
- Budget filter dropdown in transactions now shows all non-archived budgets, including expired ones (UI-004)

## 2026-02-06

### Added
- GCP deployment infrastructure for web frontend (P9-001 through P9-006)
  - Created `Dockerfile.web` with multi-stage build for Next.js standalone output
  - Enabled Next.js standalone mode in `next.config.ts` for smaller Docker images
  - Added Terraform resources for web Cloud Run Service
  - Added `allowed-email` and `allowed-password` secrets to Secret Manager (passed as build args)
  - Updated CI/CD pipeline (`deploy.yml`) to build and deploy web service separately
  - Web service runs on Cloud Run, proxies GraphQL to existing webhook service
  - Parallel builds for backend and web in CI/CD for faster deployments

### Added
- ADR-002: GraphQL schema management decision (P2-011)
  - Researched schema-first vs code-first approaches (Pothos, TypeGraphQL, Nexus)
  - Decision: Keep current SDL-first approach — stable schema, working codegen, migration not justified
  - Documented in `docs/decisions/ADR-002-graphql-schema-management.md`

- WebSocket subscriptions infrastructure (P2-010)
  - Added WebSocket upgrade support to HttpServer module
  - Integrated `graphql-ws` for GraphQL subscription protocol
  - Created subscription schema with `Subscription` type in `subscriptions.graphql`
  - Added subscription resolvers for: monthlyOverviewUpdated, budgetUpdated, allocationUpdated, transactionUpdated
  - Added subscription topics in `subscriptionTopics.ts`
  - Added PubSub instance to GraphQL context for event publishing
  - Updated frontend Apollo Client with split link (HTTP for queries/mutations, WebSocket for subscriptions)
  - Server now logs WebSocket endpoint: `GraphQL Subscriptions: WS ws://localhost:{port}/graphql`

- E2E tests for Budget Overview page (P8-003)
  - `metrics-display.spec.ts`: tests monthly overview metrics display
  - `month-navigation.spec.ts`: tests navigating between months
  - `budget-table.spec.ts`: tests budget table with seeded data
  - `edit-allocation.spec.ts`: tests inline allocation editing
  - `move-funds.spec.ts`: tests move funds dialog
  - `create-budget.spec.ts`: tests creating budget via dialog
  - `archive-budget.spec.ts`: tests archiving budget

- E2E tests for Transactions and Accounts pages (P8-004)
  - `transactions/load-page.spec.ts`: tests loading transactions page
  - `transactions/search.spec.ts`: tests search filtering
  - `transactions/pagination.spec.ts`: tests pagination controls
  - `transactions/verify-transaction.spec.ts`: tests verifying transactions
  - `accounts/load-page.spec.ts`: tests accounts page with grouped accounts
  - `accounts/create-manual.spec.ts`: tests creating manual accounts
  - `accounts/archive-manual.spec.ts`: tests archiving manual accounts
  - `accounts/synced-readonly.spec.ts`: tests synced accounts badge display

- Added missing data-qa attributes to budget dialogs
  - `create-budget-dialog.tsx`: added btn-create-cancel, btn-create-submit
  - `archive-budget-dialog.tsx`: added dialog-archive-budget, btn-archive-cancel, btn-archive-confirm

### Changed
- Updated BudgetPage page object to use Enter key for inline allocation saving (no save button exists)
- Updated AccountsPage page object to fill balance field (required for form submission)
- Fixed move-funds test to use partial text matching for budget selection (options include balance amount)
- Fixed data factory createAccount to only send schema-valid fields

### Changed
- Refactored E2E tests to one scenario per file (P8-005)
  - Split `e2e/tests/smoke.spec.ts` into separate files under `e2e/tests/smoke/`
  - `authentication.spec.ts`: tests login flow and landing page
  - `navigation.spec.ts`: tests sidebar navigation between pages
  - `graphql-api.spec.ts`: tests GraphQL fixture API access
  - Enables better parallelization, easier debugging, and clearer test reports

### Added
- Page Object Model and reusable component classes for E2E tests (P8-002)
  - `BasePage` class with common selectors, wait utilities, and navigation helpers
  - Reusable component classes: `Table`, `Dialog`, `InlineEditor`, `MonthSelector`
  - Page objects: `BudgetPage`, `TransactionsPage`, `AccountsPage`, `CategoriesPage`
  - Added `data-qa` attributes to all major frontend components for reliable element selection
  - All page objects and components exported from `e2e/fixtures/index.ts`

- Playwright E2E test infrastructure (P8-001)
  - Installed `@playwright/test` and `playwright` dependencies
  - Created `docker-compose.e2e.yml` for isolated test environment (PostgreSQL on port 5433, API on 4002, Web on 3001)
  - Created `playwright.config.ts` with Chromium project and web server orchestration
  - Created test fixtures in `e2e/fixtures/`:
    - `test-base.ts` with `authenticatedPage` and `graphql` fixtures via `test.extend()`
    - `data-factories.ts` with GraphQL-based factories for budgets, categories, allocations, accounts, transactions
  - Created `e2e/tests/smoke.spec.ts` with 3 smoke tests (auth, navigation, GraphQL API)
  - Added justfile commands: `test-e2e`, `test-e2e-ui`, `test-e2e-headed`, `e2e-up`, `e2e-down`, `e2e-logs`, `e2e-report`
  - All 3 smoke tests passing

### Added
- Complete API integration tests for core queries and mutations (P7-002)
  - `budgets.test.ts`: tests for budgets query/mutation CRUD (create, update, archive, filter by active)
  - `categories.test.ts`: tests for categories query/mutation CRUD with hierarchy support
  - `allocations.test.ts`: tests for allocations CRUD and moveFunds mutation
  - `transactions.test.ts`: tests for transactions with all filters (account, category, budget, type, date range, search, status, pagination)
  - `monthly-overview.test.ts`: tests for monthlyOverview computation (availableFunds, capitalBalance, totalAllocated, totalSpent, savingsRate, budgetSummaries with carryover)
  - 88 total API integration tests passing

### Changed
- Upgraded Apollo Client from 3.14.0 to 4.1.4
  - React hooks now imported from `@apollo/client/react` instead of `@apollo/client`
  - ApolloProvider moved to `@apollo/client/react`
  - Replaced `ApolloError` type with `ErrorLike` (new error handling in v4)
  - `ApolloCache` is no longer generic (removed type parameter)
  - Added RxJS as peer dependency (required by Apollo Client 4)

- Upgraded GraphQL Codegen from 5.0.7 to 6.1.1
  - Updated client-preset from 4.8.3 to 5.2.2
  - No breaking changes for our usage

- Added missing transaction mutations to frontend
  - Added `UpdateTransactionCategory` mutation
  - Added `VerifyTransaction` mutation
  - These were referenced in components but missing from .graphql files

### Fixed
- Wired up TransactionsTable component to transactions page
  - Page was showing placeholder only, now shows full transactions table with filters

### Added
- API integration test infrastructure (P7-001)
  - Created `tests/integration/api/` directory with test harness
  - `TestHarness` class for setting up Apollo Server with test DI container
  - Test factories for creating accounts, categories, budgets, allocations, transactions
  - `SilentLogger` for quiet test output
  - `just test-api` command for running API integration tests
  - First API integration tests for accounts queries and mutations

### Changed
- Upgraded Next.js from 15.3.0 to 16.1.6 (P3-005)
  - Updated eslint-config-next to 16.1.6
  - Migrated from `next lint` (removed in v16) to `eslint .` directly
  - Migrated ESLint config to new flat config format (required by v16)
  - Fixed React Compiler ESLint errors:
    - Refactored dialogs to use key prop pattern for state reset
    - Converted theme-toggle and use-auth to use useSyncExternalStore
    - Fixed useMemo dependencies by extracting nested property access
    - Used useId for deterministic random values in sidebar skeleton

### Added
- Frontend environment documentation in CLAUDE.md (P3-008)
  - Added "Frontend Development" section with tech stack, configuration, and commands
  - Updated REVIEW-SUMMARY.md with codegen step in setup instructions

- ADR for frontend linting strategy (P3-010)
  - Decision: Keep ESLint for frontend (next/core-web-vitals provides Next.js-specific rules)
  - Documented in docs/decisions/ADR-001-frontend-linting.md

- Frontend quality checks to `just check` command (P3-007)
  - Now runs `tsc --noEmit` and `bun run lint` in web/ directory
  - Fixed TypeScript errors in cache-utils.test.ts (added non-null assertions)

- Optimistic cache updates for budget mutations (P4-006)
  - Inline allocation editing now updates UI instantly without waiting for server response
  - Move funds dialog updates both source and destination budgets immediately
  - Created cache-utils.ts with reusable cache update functions
  - Added unit tests for cache update utilities

- Basic auth gate for single-user authentication (P3-004)
  - Login screen with email validation against NEXT_PUBLIC_ALLOWED_EMAIL env var
  - AuthProvider context and useAuth hook for auth state management
  - AuthGate component that wraps the app and shows login when unauthenticated
  - Logout button in sidebar footer showing user email
  - Loading skeleton during auth state initialization
  - Created web/.env.example with auth configuration

- Password protection for auth gate
  - Added NEXT_PUBLIC_ALLOWED_PASSWORD environment variable
  - Login now requires both email and password
  - Generic "Invalid email or password" error message for security
  - Updated .env.example with password configuration
