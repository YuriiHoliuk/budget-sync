# Review Summary: Commits 9d9646f..HEAD

**Date**: 2026-02-02
**Commits analyzed**: 14 commits across phases P1 through P4
**Lines changed**: ~11,400 added, ~105 removed across 135 files

---

## Overview of Changes

This batch of work implements a full-stack YNAB-style envelope budgeting web application on top of the existing backend (Monobank sync, Google Sheets, PostgreSQL). The work spans four major phases:

### Phase 2: GraphQL API Foundation
A complete GraphQL API was built using Apollo Server v5, integrated into the existing Bun HTTP server via a custom `GraphQLServer` module (`src/modules/graphql/`). The API provides:

- **Accounts**: Read-only queries (accounts come from bank sync)
- **Budgets**: Full CRUD (create, update, archive) with type enums (Spending, Savings, Goal, Periodic)
- **Categories**: Full CRUD with hierarchical parent/child support
- **Allocations**: Full CRUD plus `moveFunds` mutation (paired allocations, negative source / positive destination)
- **Transactions**: Filtered/paginated queries, mutations for category/budget assignment and verification
- **Monthly Overview**: Computed query implementing YNAB-style envelope budgeting logic (Ready to Assign, per-budget available, carryover chains)

Key architectural decisions:
- Resolvers are plain objects accessing the DI container via `context.container.resolve(TOKEN)` -- not `@injectable()` classes
- Money values converted from minor units (kopecks) to major units (UAH) at the GraphQL layer
- Schema files are `.graphql` loaded via `readFileSync`, combined in `schema/index.ts`
- `BudgetCalculationService` is a pure domain service with no I/O dependencies (404 lines of computation logic)

### Phase 3: Next.js Frontend Setup
A Next.js 15 application was created in `web/` with:

- **ShadCN UI** (new-york style, neutral theme) with 15+ installed components
- **Apollo Client** with `ApolloWrapper` provider
- **GraphQL Codegen** (`@graphql-codegen/client-preset`) reading backend `.graphql` schema files
- **Proxy**: Next.js rewrites `/api/graphql` -> `localhost:4001/graphql`
- **App layout**: Sidebar navigation (Budget, Accounts, Transactions, Categories, Settings), month selector with prev/next arrows, dark mode toggle with localStorage persistence
- **MonthProvider** context for global month state (YYYY-MM format)
- Responsive design: sidebar collapses to sheet overlay on mobile
- Keyboard shortcut: Cmd+B to toggle sidebar

### Phase 4: Budget Overview Page (Main Feature)
The primary UI page was built with three main components:

1. **MonthlyOverviewHeader**: "Ready to Assign" banner (color-coded), metrics row (Available Funds, Capital, Total Allocated, Total Spent, Savings Rate), loading skeletons
2. **BudgetTable**: Budgets grouped by type, group header rows with aggregate totals, progress bars (green/yellow/red), color-coded available amounts, inline allocation editing
3. **MoveFundsDialog**: Source/destination budget selects with available balance display, amount validation, warning for overspending

---

## Commits Summary

| Commit | Description | Phase |
|--------|-------------|-------|
| `751bdc0` | GraphQL API foundation with Apollo Server | P2-001 |
| `6f39c7c` | GraphQL Accounts schema | P2-002 |
| `778bce9` | GraphQL Budgets schema with queries | P2-003 |
| `6bf168e` | Fix Ralph loop directory issue | Tooling |
| `7027a49` | Budget CRUD mutations with use cases and tests | P2-003 |
| `0218ea5` | GraphQL Categories schema with CRUD | P2-004 |
| `4e77605` | GraphQL Allocations schema with CRUD | P2-005 |
| `f5cb6a7` | GraphQL Transactions schema with queries/mutations | P2-006 |
| `34daace` | Monthly Overview computed query | P2-007 |
| `b5de7ad` | Next.js frontend with ShadCN UI, Apollo Client, codegen | P3-001/002 |
| `cd095d7` | App layout with navigation sidebar, month selector, dark mode | P3-003 |
| `952bf45` | Monthly Overview header with key metrics | P4-001 |
| `02aab1f` | Budget table with inline allocation editing | P4-002 |
| `35158b7` | Move Funds dialog | P4-003 |

---

## How to Run Locally

### Prerequisites
- Bun runtime
- Docker (for PostgreSQL)
- Just (task runner): `brew install just`

### Step-by-step

```bash
# 1. Start local PostgreSQL
just db-up

# 2. Run database migrations
just db-migrate

# 3. Seed database with test data (5 accounts, 23 categories, 15 budgets, etc.)
just db-seed

# 4. Start the backend API server (port 4001, with GraphQL at /graphql)
just dev-server

# 5. In a separate terminal, install web dependencies and set up environment
just web-install
cp web/.env.example web/.env.local
# Edit web/.env.local - set NEXT_PUBLIC_ALLOWED_EMAIL and NEXT_PUBLIC_ALLOWED_PASSWORD

# 6. Generate GraphQL types (required before first run or after schema changes)
just codegen

# 7. Start the frontend
just dev-web
```

### Access points
- **Frontend**: http://localhost:3000
- **GraphQL API**: http://localhost:4001/graphql (direct)
- **GraphQL via proxy**: http://localhost:3000/api/graphql (via Next.js rewrite)

### Other useful commands
```bash
just check          # typecheck + lint (backend only)
just test           # run unit tests
just codegen        # regenerate GraphQL types for frontend
just db-reset       # destroy and recreate database
just db-studio      # open Drizzle Studio for DB inspection
```

### Environment
- Backend uses `container.local.ts` which mocks external services (Monobank, Google Sheets, PubSub) and uses real PostgreSQL
- Default DATABASE_URL: `postgresql://budget_sync:budget_sync@localhost:5432/budget_sync`
- Frontend and backend are separate projects (separate `package.json`, `bun.lock`)

---

## Deployment Readiness Assessment

### Current State: NOT deployment-ready

The web application is local-development only. Several gaps exist before production deployment:

1. **No Cloud Run Service configuration**: TASKS.json task P9-001 (Cloud Run Service for web app) is `todo`. Terraform does not yet define a Cloud Run Service for the web frontend/API.

2. **No Dockerfile for web**: The existing `Dockerfile` is for backend jobs. A multi-stage build for Next.js + API is needed.

3. **No authentication**: Task P3-004 (basic auth gate, email-only) is `todo`. The app is completely open.

4. **No API integration tests**: Tasks P7-001 and P7-002 are `todo`. There are unit tests (750+) but no API-level integration tests.

5. **No E2E tests**: Tasks P8-001 through P8-003 are all `todo`. Playwright is not installed.

6. **Remaining P4 tasks**: P4-004 (Budget CRUD dialogs) and P4-005 (Unbudgeted Transactions warning) are `todo`.

7. **No Accounts/Transactions pages**: P5-001, P5-002, P5-003 are all `todo` (placeholder pages exist but have no content).

8. **No Categories management page**: P6-001 is `todo`.

### What IS ready
- GraphQL API is fully functional with all CRUD operations and the monthly overview query
- The Budget Overview page (main feature) is largely complete with inline editing and move funds
- Backend tests are comprehensive: 750+ unit tests pass
- Local development environment works end-to-end with Docker PostgreSQL
- Clean architecture is maintained throughout

---

## Key Findings from TASKS.json

### Completed (16 tasks)
- P1-001 through P1-004: Local dev environment (Docker, DI container, dev server, seed script)
- P2-001 through P2-007: Full GraphQL API (Apollo Server, Accounts, Budgets, Categories, Allocations, Transactions, Monthly Overview)
- P3-001 through P3-003: Next.js frontend setup (app init, codegen, layout)
- P4-001 through P4-003: Budget Overview page (header, table, move funds)

### Remaining (11 tasks)
- **P3-004**: Auth gate (email-only, single user)
- **P4-004**: Budget CRUD dialogs (create, edit, archive)
- **P4-005**: Unbudgeted Transactions warning section
- **P5-001**: Accounts page
- **P5-002**: Transactions page with filtering/pagination
- **P5-003**: Transaction detail/edit panel
- **P6-001**: Categories management page
- **P7-001/002**: API integration test infrastructure and tests
- **P8-001/002/003**: Playwright E2E tests
- **P9-001**: Cloud Run Service deployment

### Dependency chain for deployment
P9-001 depends on P4-005 and P5-003, which depend on P4-002, P5-002, and P2-006. The critical path to deployment requires completing all P4 and P5 tasks first.

---

## Key Findings from Changelog and Learning Docs

### Architecture Patterns Established (from LEARNINGS.md)
- Apollo Server v5 uses `executeHTTPGraphQLRequest` for framework-agnostic integration with `HeaderMap`
- The `HttpServer` pre-parses request bodies; GraphQL handlers must use `HttpRequest.body` not `request.raw`
- GraphQL codegen initially used `documentMode: "string"` which produces `TypedDocumentString` (incompatible with Apollo Client `useQuery`). This was fixed by removing `documentMode` config.
- Transaction domain entity does NOT carry categorization data (categoryId, budgetId, status). These live on the DB row only. The `transactionsResolver` works directly with `DatabaseTransactionRepository` via a separate token.
- Allocations are DB-only (no spreadsheet dual-write needed)

### Test Coverage Growth (from CHANGELOG.md)
- P2-003: 626 tests -> 644 tests (18 new)
- P2-004: 644 -> 661 (17 new)
- P2-005: 661 -> 681 (20 new)
- P2-006: 681 tests (no new tests mentioned)
- P2-007: 681 -> 707 (26 new for BudgetCalculationService)
- P4-001/002/003: 707 -> 750 (verified passing; new tests from P3/P4 not explicitly counted)

### Development Process
- Built iteratively using "Ralph loop" (autonomous Claude Code loop with PROMPT.md)
- Each task was verified with: typecheck, lint, unit tests, and manual testing with real data
- Frontend builds verified after each change (`next build` passes)
- YNAB-style UX as design reference (envelope budgeting model)

### Notable Technical Decisions
- Money stored in minor units (kopecks) internally, converted to major units at GraphQL boundary
- BudgetCalculationService is a pure domain service (no DB calls) -- all data fetched in resolver and passed in
- Spending budgets: only negative carryover carries forward (YNAB semantics)
- Savings/Goal/Periodic budgets: allocations and spending accumulate over all time
- Ready to Assign = sum(operational account balances) - sum(all allocations ever)
