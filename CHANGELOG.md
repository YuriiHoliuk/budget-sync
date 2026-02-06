# Changelog

## 2026-02-06

### P6-001: Build Categories management page

- Created Categories page (`/categories`) with full CRUD functionality
- Created GraphQL mutations for categories: CreateCategory, UpdateCategory, ArchiveCategory
- Built `CategoriesTable` component:
  - Displays hierarchical category tree with expand/collapse for parent categories
  - Shows children categories indented under their parents with full path display
  - Status badges (Active/Suggested/Archived) for each category
  - Children count column for parent categories
  - "Show archived" toggle to include/exclude archived categories
- Created `CreateCategoryDialog`:
  - Name input field
  - Optional parent category selector (dropdown of root categories)
  - Status selector (Active/Suggested)
- Created `EditCategoryDialog`:
  - Pre-populated with current category values
  - Parent category selector (disabled for categories with children)
  - Status selector including Archived option
- Created `ArchiveCategoryDialog`:
  - Confirmation dialog with clear messaging
  - Shows full category path in confirmation message
- Added ShadCN Switch component for "Show archived" toggle
- Categories link already existed in sidebar navigation
- All mutations refetch both active and all categories lists

### P5-003: Build Transaction detail/edit panel

- Created `TransactionDetailPanel` component using Sheet UI from ShadCN
- Panel opens when clicking any transaction row in the transactions table
- Displays full transaction details:
  - Title (counterparty name), date, amount with currency
  - Status badge (Pending/AI Categorized/Verified)
  - Classification section with Category and Budget dropdowns
  - AI reasoning notes for category/budget when available
  - Verify Categorization button for non-verified transactions
  - Transaction Details: Account (with Synced/Manual badge), Counterparty, IBAN, MCC
  - Additional info: Cashback, Commission, Receipt ID (when available)
  - Identifiers section: Internal ID, External ID
- Added click propagation handling to prevent row clicks when interacting with inline edit buttons
- Uses existing mutations (UpdateTransactionCategory, UpdateTransactionBudget, VerifyTransaction)
- Tested panel opening, category/budget editing, and close behavior

### P5-002: Build Transactions page with filtering and pagination

- Created full Transactions page with comprehensive filtering and pagination
- Added GraphQL operations:
  - `GetTransactions` query with full transaction fields including category, budget, account relations
  - `GetTransaction` query for single transaction details
  - `GetCategories` query for filter dropdown
  - `UpdateTransactionCategory` mutation
  - `VerifyTransaction` mutation
- Created `TransactionsTable` component:
  - Search box for text search across description/counterparty
  - Filters popover with: Account, Category, Budget, Type (Expense/Income), Status (Pending/Categorized/Verified), Date range
  - Clear filters button with active filter count badge
  - Paginated table showing 25 items per page
  - Transaction rows with: date, description with type icon, account, category (clickable), budget (clickable), status badge, amount (color-coded)
  - Inline editing for category and budget via dropdowns
  - Verify button for non-verified transactions
- Added ShadCN Popover component for filters panel
- Fixed ShadCN Select v4 compatibility issue (empty string values not allowed, use "all"/"none" sentinel values)
- Tested filtering, pagination, and UI interactions with browser

### P5-001: Build Accounts page with CRUD for manual accounts

- Created full Accounts page showing all accounts grouped by role (Operational, Savings)
- Added GraphQL mutations for accounts: CreateAccount, UpdateAccount, ArchiveAccount
- Updated GetAccounts query to include all account fields (source, lastSyncTime, creditLimit, etc.)
- Created `AccountsTable` component:
  - Groups accounts by role with subtotals
  - Shows account icon based on type (Debit/Credit/FOP)
  - Displays name, bank, type badge, currency, balance, truncated IBAN with tooltip
  - Source badge (Synced/Manual) with link icon
  - Last sync time indicator for synced accounts
  - Row action dropdown (Edit, Archive for manual accounts)
- Created `CreateAccountDialog`:
  - Form fields: name, type, role, currency, balance, credit limit (for credit accounts), IBAN
  - Contextual descriptions for each field
  - Input validation and error handling
- Created `EditAccountDialog`:
  - Pre-populates with existing account data
  - Shows info alert for synced accounts (protected fields warning)
  - Currency and IBAN are disabled for synced accounts
- Created `ArchiveAccountDialog`:
  - Confirmation dialog with clear explanation
  - Destructive-styled Archive button
- Added ShadCN Alert component for protected fields warning
- Tested all CRUD operations end-to-end with browser

### P4-005: Build Unbudgeted Transactions warning section

- Added `unbudgetedOnly` and `accountRole` filters to GraphQL TransactionFilter
- Implemented IS NULL filter for budgetId in DatabaseTransactionRepository
- Added account role filter with proper join to accounts table
- Created `UnbudgetedTransactionsWarning` frontend component:
  - Shows amber warning box below budget table when unbudgeted expenses exist
  - Displays count and total amount of unbudgeted transactions
  - Expandable table showing: date, description, account, amount
  - Quick budget assignment dropdown for each transaction
  - Automatically updates budget table when transaction is assigned
- Added GraphQL operations:
  - `GetUnbudgetedTransactions` query (filters by unbudgetedOnly, operational accounts, debit type)
  - `UpdateTransactionBudget` mutation
- Tested feature end-to-end with browser testing

## 2026-02-05

### P4-004: Build Budget CRUD dialogs (create, edit, archive)

- Created `CreateBudgetDialog` component with form fields:
  - Name input, Type dropdown (Spending/Savings/Goal/Periodic)
  - Target amount input with contextual help text per budget type
  - Conditional cadence selector for Savings/Periodic budgets
  - Target date picker for Goal budgets
- Created `EditBudgetDialog` component:
  - Pre-populates form with existing budget data via GetBudget query
  - Same form fields as create, with update logic
- Created `ArchiveBudgetDialog` component:
  - Confirmation dialog with warning icon
  - Shows budget name and explains archival behavior
  - Destructive-styled Archive button
- Added GraphQL operations to frontend:
  - `budgets.graphql` mutations: CreateBudget, UpdateBudget, ArchiveBudget
  - `budgets.graphql` queries: GetBudget, GetBudgets
- Integrated dialogs into BudgetTable:
  - "New Budget" button in table header
  - Row action dropdown menu (Edit, Move Funds, Archive)
  - Added column for action menu
- All dialogs follow existing patterns (MoveFundsDialog)
- Tested Create, Edit, and Archive flows in browser

### P2-009: Add createTransaction mutation for manual accounts

- Implemented `CreateTransactionUseCase` in application layer
  - Validates target account exists and is manual (not synced)
  - Converts amount from major units to minor units
  - Generates unique external ID for each transaction (`manual-txn-{timestamp}-{random}`)
  - Sets categorization status to `pending` by default
- Added `ManualTransactionNotAllowedError` domain error
  - Thrown when attempting to create transaction on synced account
- Added `createTransaction` mutation to `transactions.graphql` schema
  - Required fields: `accountId`, `date`, `amount`, `type`, `description`
  - Optional fields: `counterpartyName`, `counterpartyIban`, `mcc`, `notes`
- Updated `TransactionsResolver` with mutation handler
- Fixed `DatabaseTransactionRepository.saveManyAndReturn()` to resolve account DB IDs
  - Previously left `accountId` null, breaking account field resolution
  - Now looks up account DB IDs from external IDs before insert
- 8 new unit tests for CreateTransactionUseCase (776 total pass)
- Verified mutation via local dev server with manual and synced accounts

### P2-008: Add Accounts CRUD mutations with sync field protection

- Added `source` enum field to Account entity: `'bank_sync' | 'manual'`
  - `bank_sync`: Accounts synced from external bank APIs (Monobank)
  - `manual`: Accounts created by user (cash, other banks)
- Added `isArchived` boolean field to Account for soft deletion
- Added `AccountType` enum: `'debit' | 'credit' | 'fop'`
  - Replaces Monobank card types (black, iron, etc.) with semantic types
  - MonobankMapper converts Monobank types to AccountType during sync
- Updated database schema (`accounts` table):
  - Added `source` column (varchar(20), default 'bank_sync')
  - Added `is_archived` column (boolean, default false)
  - Generated migration `0001_hard_gargoyle.sql`
- Extended `AccountRepository` with new methods:
  - `findByDbId(dbId)`: Find by database serial ID
  - `findActive()`: Find non-archived accounts only
  - `findByName(name)`: Find by account name (case-insensitive)
- Created Account use cases:
  - `CreateAccountUseCase`: Create manual accounts with unique name validation
  - `UpdateAccountUseCase`: Update with protected field validation for synced accounts
  - `ArchiveAccountUseCase`: Soft delete via isArchived flag
- Added domain errors:
  - `ProtectedFieldUpdateError`: When modifying protected fields on synced accounts
  - `AccountNameTakenError`: When creating account with existing name
- Protected fields for synced accounts: `currency`, `iban`
  - Attempting to change these throws `ProtectedFieldUpdateError`
  - Same values are allowed (no-op)
- Updated GraphQL schema (`accounts.graphql`):
  - Added `source: AccountSource!` and `isArchived: Boolean!` to Account type
  - Added `AccountSource` enum (BANK_SYNC, MANUAL)
  - Added `activeOnly` argument to `accounts` query (default: true)
  - Added mutations: `createAccount`, `updateAccount`, `archiveAccount`
  - Added input types: `CreateAccountInput`, `UpdateAccountInput`
- Updated mappers:
  - `DatabaseAccountMapper`: Maps `source` and `isArchived`
  - `MonobankMapper`: Sets `source: 'bank_sync'` for synced accounts
  - `SpreadsheetAccountMapper`: Updated for new AccountType values
  - GraphQL account mapper: Added `mapAccountSource()`, updated `mapAccountType()`
- Updated `AccountsResolver` with mutations and use case injection
- 27 new unit tests for CreateAccount, UpdateAccount, ArchiveAccount use cases
- 809 total tests pass (excluding rate-limited integration tests)
- All GraphQL mutations verified via local dev server

### TX-006: Refactor resolvers to injectable classes

- Created `Resolver` base class in `src/presentation/graphql/Resolver.ts`:
  - Abstract `getResolverMap()` method returning resolver map for Apollo
  - `ResolverMap` and `ResolverFn` types for type safety
- Refactored all 7 resolvers to injectable classes:
  - `HealthResolver` - simple health check query
  - `AccountsResolver` - accounts queries with repository injection
  - `BudgetsResolver` - queries + mutations, injects repository and use cases
  - `CategoriesResolver` - queries + mutations + children field resolver
  - `AllocationsResolver` - queries + mutations + budget field resolver
  - `TransactionsResolver` - queries + mutations + account/category/budget field resolvers
  - `MonthlyOverviewResolver` - monthly overview computation
- Updated resolver registry (`resolvers/index.ts`):
  - Exports `RESOLVER_CLASSES` array of injection tokens
  - `buildResolverMaps(container)` function builds resolver maps from DI container
- Updated `server.ts` to use `buildResolverMaps(container)` instead of importing static resolver objects
- Benefits achieved:
  - Dependencies injected via constructor (no more `context.container.resolve()` calls)
  - Consistent pattern with existing Controller base class
  - Better testability - resolvers can be unit tested with mocked dependencies
  - Type-safe dependency injection (compile-time errors for missing dependencies)
- All 788 tests pass, typecheck and lint clean

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
