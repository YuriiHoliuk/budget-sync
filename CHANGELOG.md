# Changelog

## 2026-02-02

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
