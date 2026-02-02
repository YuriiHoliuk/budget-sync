# Changelog

## 2026-02-02

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
