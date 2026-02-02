# Changelog

## 2026-02-02

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
