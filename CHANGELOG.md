# Changelog

## 2026-02-02

### P2-003: GraphQL Budgets schema with queries

- Enriched `Budget` domain entity with `type`, `isArchived`, `targetCadence`, `targetCadenceMonths`, `targetDate` fields (previously only had name/amount/dates)
- Updated `DatabaseBudgetMapper` to map all budget fields (was hardcoding `type: 'spending'` and `isArchived: false`)
- Updated `SpreadsheetBudgetMapper` for compatibility with new `BudgetProps`
- Added `findById(id: number)` to `BudgetRepository` interface and all implementations (Database, DualWrite, Spreadsheet)
- Created `budgets.graphql` schema with `BudgetType` and `TargetCadence` enums, `budgets(activeOnly)` and `budget(id)` queries
- Implemented `budgetsResolver` with GQL enum mapping
- Updated all test files and mocks for new Budget entity shape
- All 626 tests pass, typecheck and lint clean
