# Changelog

## 2026-02-05

### TX-005: Extract shared GraphQL mapping utilities

- Created `src/presentation/graphql/mappers/` directory with shared mapper utilities:
  - `money.ts`: `toMinorUnits()`, `toMajorUnits()`, `toMajorUnitsOrNull()` for currency conversion
  - `budget.ts`: `mapBudgetToGql()`, enum constants (`BUDGET_TYPE_TO_GQL`, `GQL_TO_BUDGET_TYPE`, etc.), `mapOptionalGqlEnum()`
  - `allocation.ts`: `mapAllocationToGql()` and `AllocationGql` type
  - `account.ts`: `mapAccountToGql()`, `mapAccountType()`, `MONOBANK_TYPE_TO_GQL`
  - `category.ts`: `mapCategoryToGql()`, `mapCategoryStatus()`, enum constants
  - `transaction.ts`: `mapTransactionRecordToGql()`, status/type enum constants
  - `index.ts`: Re-exports all shared utilities
- Updated all resolvers to import from shared mappers:
  - `accountsResolver.ts`: removed local `mapAccountToGql`, uses shared
  - `budgetsResolver.ts`: removed local constants and functions, uses shared
  - `allocationsResolver.ts`: removed local mapping code, uses shared (including `mapBudgetToGql` for child resolver)
  - `categoriesResolver.ts`: removed local mapping code, uses shared
  - `transactionsResolver.ts`: removed local mapping code, uses shared mappers for all entity types
  - `monthlyOverviewResolver.ts`: removed local `toMajorUnits` and `BUDGET_TYPE_TO_GQL`, uses shared
- Eliminated ~150 lines of duplicate code across resolvers
- All 746 tests pass, typecheck and lint clean

### TX-002: Fix typecasting violations in mappers

- Created type guard utilities in domain layer for safe runtime type narrowing:
  - `isBudgetType()`, `parseBudgetType()` in `Budget.ts` for BudgetType validation
  - `isTargetCadence()`, `parseTargetCadence()` in `Budget.ts` for TargetCadence validation
  - `isAccountRole()`, `parseAccountRole()` in `Account.ts` for AccountRole validation
- Updated `DatabaseBudgetMapper` to use `parseBudgetType()` and `parseTargetCadence()` instead of `as` casts
- Updated `DatabaseAccountMapper` to use `parseAccountRole()` instead of `as AccountRole` cast
- Fixed `GraphQLServer` double cast (`as unknown as GraphQLContext`) by throwing an error for invalid state
- Exported new type guards and parse functions from `src/domain/entities/index.ts`
- All 726 tests pass, typecheck and lint clean

### TX-001: Fix architecture dependency rule violations

- Created domain-level types for transaction queries in `src/domain/repositories/transaction-types.ts`:
  - `TransactionRecord` - full transaction data including categorization fields (for GraphQL)
  - `TransactionFilterParams` - query filters (moved from infrastructure)
  - `PaginationParams` - pagination parameters (moved from infrastructure)
  - `TransactionSummary` - lightweight data for budget calculations
- Added record-based methods to `TransactionRepository` interface:
  - `findRecordById()`, `findRecordsFiltered()`, `countFiltered()` for queries
  - `updateRecordCategory()`, `updateRecordBudget()`, `updateRecordStatus()` for mutations
  - `findTransactionSummaries()` for budget calculations
- Updated `DatabaseTransactionRepository` with `rowToRecord()` helper to convert DB rows to domain records
- Updated `DualWriteTransactionRepository` to delegate record operations to DB repo
- Updated `SpreadsheetTransactionRepository` with not-supported implementations for DB-specific methods
- Refactored `transactionsResolver.ts` to import only from domain layer (`TransactionRepository`, `TransactionRecord`)
- Refactored `monthlyOverviewResolver.ts` to use domain `TransactionRepository` token
- Removed duplicate `DATABASE_TRANSACTION_REPOSITORY_TOKEN` registration from local container
- Resolvers now follow Clean Architecture: presentation → domain only, no infrastructure imports
- All 726 tests pass, typecheck and lint clean

### TX-003: Add tests for DatabaseAllocationMapper

- Created comprehensive unit tests for `DatabaseAllocationMapper` in `tests/unit/infrastructure/mappers/DatabaseAllocationMapper.test.ts`
- Tests `toEntity()` mapping: correct properties, null notes, negative/zero amounts, large values, date parsing, boundary months
- Tests `toInsert()` mapping: all fields, date formatting (YYYY-MM-DD), null/empty notes, negative amounts, period preservation
- Tests roundtrip conversion to ensure data integrity through `toEntity` -> `toInsert` cycle
- 19 new tests (726 total pass)

### TX-004: Add tests for DualWrite repositories

- Created unit tests for `DualWriteBudgetRepository` in `tests/unit/infrastructure/repositories/DualWriteBudgetRepository.test.ts`
- Created unit tests for `DualWriteCategoryRepository` in `tests/unit/infrastructure/repositories/DualWriteCategoryRepository.test.ts`
- Tests read operations: verify DB repo is called, spreadsheet repo is not called
- Tests write operations (save, saveAndReturn): verify both repos are called, DB first then spreadsheet
- Tests error handling: spreadsheet failures are logged but don't affect DB operations
- Tests update: verify only DB repo is called (current implementation doesn't dual-write updates)
- 20 new tests (746 total pass)

## 2026-02-02

### P4-003: Move Funds dialog

- Created `MoveFundsDialog` component with source/destination budget selects and amount input
- Each select dropdown shows budget name + available balance (color-coded for negative)
- Source budget is disabled in destination dropdown (and vice versa) to prevent self-transfers
- Shows available balance hint below each selected budget
- Warning when amount exceeds source budget's available balance
- Submit via button or Enter key, cancel via Escape or Cancel button
- Uses `moveFunds` GraphQL mutation, refetches `monthlyOverview` on success
- Added `move-funds.graphql` frontend mutation document, ran codegen
- Installed ShadCN `dialog`, `label`, `select` components
- Added "Move Funds" button above budget table (header-level action)
- Added hover-reveal move icon on each budget row's Available cell (row-level shortcut, pre-selects source)
- Verified: Next.js build passes, backend checks pass (750 tests), mutation works end-to-end with real data

### P4-002: Budget table with inline allocation editing

- Built `BudgetTable` component with budgets grouped by type (Spending, Savings, Goals, Periodic)
- Group header rows show aggregate totals for allocated, spent, and available
- Each budget row displays: name, target, allocated (editable), spent, available (color-coded), progress bar
- Progress bar changes color: green (<80%), yellow (80-99%), red (100%+)
- Available column color-coded: green (positive), red (negative), muted (zero)
- Implemented `InlineAllocationEditor`: click allocation cell to edit, Enter to save, Escape to cancel
- Editor calculates delta from current amount and creates a new allocation via `createAllocation` mutation
- Refetches `monthlyOverview` after mutation to update all metrics (Ready to Assign, totals, per-budget)
- Created `allocations.graphql` frontend mutations (createAllocation, updateAllocation)
- Refactored `MonthlyOverviewHeader` to accept props (lifted query to page level to share data with table)
- Added loading skeleton for budget table
- Installed ShadCN `table` and `progress` components
- Verified: Next.js build passes, 750 backend tests pass, inline editing works end-to-end with real data

### P4-001: Monthly Overview header with key metrics

- Created `monthly-overview.graphql` query document for the monthlyOverview API
- Changed GraphQL codegen from `documentMode: "string"` to default `DocumentNode` for Apollo Client compatibility
- Created `formatCurrency` and `formatPercent` utilities in `web/src/lib/format.ts` (Ukrainian locale, UAH)
- Built `MonthlyOverviewHeader` component with:
  - Prominent "Ready to Assign" banner with color coding (green=0, yellow>0, red<0)
  - Metrics row: Available Funds, Capital, Total Allocated, Total Spent, Savings Rate
  - Loading skeleton state and error display
  - Reactive to month changes via `useMonth` hook
- Installed ShadCN `badge` component
- Integrated header into Budget Overview page (`page.tsx`)
- Verified: Next.js build passes, 707 backend tests pass, visually tested in dark and light modes with real data

### P3-003: App layout with navigation sidebar

- Installed ShadCN sidebar, separator, tooltip, sheet, skeleton, dropdown-menu components
- Created `AppSidebar` with navigation links: Budget, Accounts, Transactions, Categories, Settings
- Created `AppHeader` with sidebar toggle, month selector (prev/next arrows), and dark mode toggle
- Created `MonthProvider` context (`useMonth` hook) for global month state (YYYY-MM format)
- Created `ThemeToggle` with localStorage persistence and system preference detection
- Created `AppShell` wrapping SidebarProvider + MonthProvider for the full layout
- Added route pages: `/accounts`, `/transactions`, `/categories`, `/settings` (placeholder content)
- Updated root `page.tsx` to show Budget Overview as the main page
- Responsive design: sidebar collapses to sheet overlay on mobile, icon-collapsible on desktop
- Keyboard shortcut: Cmd+B to toggle sidebar
- Dark mode: full theme support via CSS class toggle on `<html>`
- Verified: build passes, all 750 backend tests pass, navigation/theme/month selector working

### P3-001 + P3-002: Next.js Frontend Setup with GraphQL Codegen

- Created `web/` directory with Next.js 15 (App Router, TypeScript, Tailwind CSS v4)
- Initialized ShadCN UI with neutral theme, new-york style, dark mode support
- Installed button and card ShadCN components as baseline
- Configured Apollo Client with `ApolloWrapper` provider for GraphQL
- Set up Next.js rewrites proxy: `/api/graphql` -> `localhost:4001/graphql`
- Configured `@graphql-codegen/client-preset` reading backend `.graphql` schema files
- Created initial `.graphql` operation files (health check, accounts queries)
- Generated typed GraphQL documents via `just codegen`
- Added justfile commands: `dev-web`, `codegen`, `web-install`
- Configured `outputFileTracingRoot` for monorepo lockfile detection
- Verified: Next.js build passes, dev server serves pages, codegen generates types, backend checks/tests unaffected (707 tests pass)

### P2-007: Monthly Overview computed query

- Created `BudgetCalculationService` in `src/domain/services/` with pure computation logic for monthly overview
- Implements YNAB-style envelope budgeting: Ready to Assign, per-budget available, spending carryover
- Spending budgets: only negative carryover carries forward (overspending as debt)
- Savings/Goal/Periodic budgets: all allocations and spending accumulate over time
- Ready to Assign = sum of operational account balances − sum of all allocations ever
- Savings rate = (income − expenses) / income for the month
- Added `findTransactionSummaries()` to `DatabaseTransactionRepository` — lightweight join query for budget calculations
- Created `monthlyOverview.graphql` with `MonthlyOverview` and `BudgetSummary` types
- Created `monthlyOverviewResolver` that fetches all data in parallel and delegates to BudgetCalculationService
- Month format validation (YYYY-MM) with descriptive error messages
- 26 new unit tests for BudgetCalculationService covering all budget types, carryover chains, edge cases (707 total pass)
- Verified all queries via local dev server with real data

### P2-006: GraphQL Transactions schema with queries and mutations

- Created `transactions.graphql` with `Transaction` type, `TransactionTypeEnum`, `CategorizationStatusEnum`, `TransactionFilter`, `PaginationInput`, `TransactionConnection` for paginated results
- Added queries: `transactions(filter, pagination)` with filtered pagination, `transaction(id)` by DB ID
- Added mutations: `updateTransactionCategory`, `updateTransactionBudget`, `verifyTransaction`
- Extended `DatabaseTransactionRepository` with `findRowByDbId`, `findRowsFiltered`, `countFiltered`, `updateCategoryByDbId`, `updateBudgetByDbId`, `updateStatusByDbId` methods
- Added `TransactionNotFoundError` domain error
- Created `transactionsResolver` with DB row-based mapping (categorization fields live on DB row, not domain entity)
- Child resolvers for `account`, `category`, `budget` fields resolve from their respective repositories
- Mutations validate referenced category/budget exists before updating
- Registered `DATABASE_TRANSACTION_REPOSITORY_TOKEN` in local container
- All 681 tests pass, typecheck and lint clean
- Verified all queries and mutations via local dev server

### P2-005: GraphQL Allocations schema with CRUD mutations

- Created `Allocation` domain entity with period validation and immutable updates
- Created `AllocationRepository` interface with budget/period query methods
- Added `AllocationNotFoundError` domain error
- Created `DatabaseAllocationMapper` and `DatabaseAllocationRepository`
- Registered allocation repository in both production and local containers (DB-only, no dual-write)
- Created `CreateAllocationUseCase`, `UpdateAllocationUseCase`, `DeleteAllocationUseCase`, `MoveFundsUseCase`
- `MoveFunds` creates paired allocations atomically (negative source, positive dest)
- Created `allocations.graphql` schema with queries (filtered by budgetId/period), CRUD mutations, `moveFunds`, and `budget` child resolver
- Implemented `allocationsResolver` with major/minor unit conversion
- Added `createTestAllocation` fixture and `createMockAllocationRepository` mock
- 20 new unit tests for all four use cases (681 total pass)
- Verified all queries and mutations via local dev server

### P2-004: GraphQL Categories schema with CRUD mutations

- Added `withUpdatedProps()` and `archive()` methods to Category entity
- Added `CategoryNotFoundError`, `CategoryNameTakenError`, `ParentCategoryNotFoundError` domain errors
- Added `findById(id)` and `update(category)` to `CategoryRepository` interface and all implementations (Database, DualWrite, Spreadsheet)
- Created `CreateCategoryUseCase`, `UpdateCategoryUseCase`, `ArchiveCategoryUseCase` in application layer
- Created `categories.graphql` schema with `CategoryStatus` enum, hierarchy support (`children` resolver, `fullPath` field), queries and mutations
- Implemented `categoriesResolver` with GQL enum mapping and parent validation
- Added `createTestCategory` fixture, updated mock repository with `findById` and `update`
- 17 new unit tests for all three use cases (661 total pass)
- Verified all queries and mutations via local dev server

### P2-003: GraphQL Budgets CRUD mutations

- Added `update(budget)` to `BudgetRepository` interface and all implementations (Database, DualWrite, Spreadsheet)
- Added `withUpdatedProps()` and `archive()` methods to Budget entity
- Added `BudgetNotFoundError` and `BudgetNameTakenError` domain errors
- Created `CreateBudgetUseCase`, `UpdateBudgetUseCase`, `ArchiveBudgetUseCase` in application layer
- Added `createBudget`, `updateBudget`, `archiveBudget` GraphQL mutations with input types
- Resolver maps GQL enums to domain types and converts major/minor currency units
- Added `createTestBudget` fixture and updated mock repository with `update` method
- 18 new unit tests for all three use cases (644 total pass)
- Verified all mutations via local dev server

### P2-003: GraphQL Budgets schema with queries

- Enriched `Budget` domain entity with `type`, `isArchived`, `targetCadence`, `targetCadenceMonths`, `targetDate` fields (previously only had name/amount/dates)
- Updated `DatabaseBudgetMapper` to map all budget fields (was hardcoding `type: 'spending'` and `isArchived: false`)
- Updated `SpreadsheetBudgetMapper` for compatibility with new `BudgetProps`
- Added `findById(id: number)` to `BudgetRepository` interface and all implementations (Database, DualWrite, Spreadsheet)
- Created `budgets.graphql` schema with `BudgetType` and `TargetCadence` enums, `budgets(activeOnly)` and `budget(id)` queries
- Implemented `budgetsResolver` with GQL enum mapping
- Updated all test files and mocks for new Budget entity shape
- All 626 tests pass, typecheck and lint clean
