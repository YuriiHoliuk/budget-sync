# Budget Sync

Personal finance management tool for tracking spendings, income, capital, and budgeting.

## Troubleshooting

When encountering errors during development or deployment, check `docs/TROUBLESHOOTING.md` for known issues and quick fixes. If the issue isn't documented and may occur again, add it to the troubleshooting doc after resolving.

## Documentation

Project documentation lives in `docs/`. Use the `/docs` skill or CLI to browse:

```bash
just docs-list              # All docs with titles (compact)
just docs-detail            # All docs with descriptions
just docs-detail <search>   # Search by name or title
```

**After any significant code change, you MUST update related documentation or create new docs if none exist.** Run `just docs-list` to find affected docs. Significant changes include: new features, modified APIs, changed architecture, updated configurations, new commands, or altered workflows.

- Update `docs/TROUBLESHOOTING.md` for issues that may recur
- Planning docs and research go in `claude_plans/`, not `docs/`
- Every doc in `docs/` should have YAML frontmatter with a `description` field

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Linter/Formatter**: Biome
- **Validation**: Zod (runtime schema validation)
- **Dependency Injection**: TSyringe (injection by type, no string tokens)
- **Testing**: Bun's built-in test runner
- **Architecture**: Clean Architecture (Layered / Hexagonal)

## Configuration

Environment variables in `.env`:
- `MONOBANK_TOKEN` - Personal Monobank API token
- `SPREADSHEET_ID` - Google Spreadsheet document ID
- `GOOGLE_SERVICE_ACCOUNT_FILE` - Path to Google service account JSON (optional on GCP, uses ADC)
- `GEMINI_API_KEY` - Google Gemini API key for LLM-based transaction categorization

## Deployment

Deployed to **Google Cloud Run Jobs** with automated CI/CD via GitHub Actions. See `docs/deployment.md` for full details (Docker builds, pipeline stages, secrets, rollback).

- **Project**: `budget-sync-483105` | **Region**: `europe-central2` (Warsaw)
- **Scheduling**: Cloud Scheduler triggers jobs on cron schedules

## Infrastructure

Infrastructure is managed with Terraform via CI/CD. See `docs/infrastructure.md` for full resource inventory, IAM, and Terraform files.

### How Changes Are Applied

All changes are applied automatically through GitHub Actions:

| You do | CI/CD does |
|--------|-----------|
| Edit `terraform/*.tf` | Terraform plan (PR) → apply (merge) |
| Edit `src/**` | Build → Deploy |
| Edit `drizzle/` | Run migrations on production DB |
| Edit both | Terraform apply → Build → Deploy |

**There are no manual apply steps.** Push your changes and CI/CD handles the rest.

### Database Migration Safety

**NEVER modify the production database schema manually.** All schema changes must go through CI/CD:

1. Generate migration files locally: `just db-generate`
2. Test locally: `just db-migrate` (against local DB)
3. Commit and push the migration files in `drizzle/`
4. CI runs tests (unit, API integration, E2E) — all must pass
5. Deploy workflow applies migration to production DB automatically

**What is allowed manually:**
- Reading production data (SELECT queries via Neon MCP)
- Inserting/updating/deleting data in existing tables if user explicitly asks (after migrations have been applied by CI)

**What is NOT allowed manually:**
- CREATE/ALTER/DROP TABLE, columns, indexes, constraints
- Any DDL statement against the production database
- Running `drizzle-kit migrate` or `drizzle-kit push` against production

## Task Runner

Project uses [Just](https://github.com/casey/just) for common commands. Run `just` to see all available commands.

```bash
# Initialize local dev environment (pulls secrets from GCP)
just init

# Sync operations
just sync                  # Sync accounts and transactions from Monobank
just job-sync-accounts     # Run sync-accounts job locally
just job-process-webhooks  # Run process-webhooks job locally
just job-debug             # Run sync-accounts job with debug logging (DEBUG=*)
just job-debug <job>       # Run a specific job with debug logging

# Code quality
just check             # typecheck + lint
just fix               # auto-fix issues
just test              # unit tests

# API integration tests (uses isolated Docker DB on port 5435)
just test-api                          # Run all API tests
just test-api-file <path>              # Run single test file
just test-api-down                     # Stop test database
just test-api-reset                    # Stop and delete test data

# GCP operations
just gcp-run               # Execute job manually
just gcp-logs              # View recent executions
just gcp-scheduler          # View scheduled jobs
```

## Frontend Development

The web frontend is a Next.js application in `web/`. See `docs/frontend-architecture.md` for routing, components, data fetching, and styling patterns.

### Frontend Tech Stack

Next.js 15 (App Router) | ShadCN UI (new-york) | Tailwind CSS v4 | Apollo Client + GraphQL | `@graphql-codegen/client-preset` | ESLint

### Frontend Configuration

Environment variables in `web/.env.local` (copy from `web/.env.example`):

| Variable | Description |
|----------|-------------|
| `API_URL` | Backend API URL (default: `http://localhost:4001`) |
| `NEXT_PUBLIC_ALLOWED_EMAIL` | Email allowed for single-user authentication |
| `NEXT_PUBLIC_ALLOWED_PASSWORD` | Password for authentication |

### Development

```bash
just dev             # Start full stack via Docker (db + migrate + seed + api + web)
just dev-fresh       # Reset everything and start fresh (destroys volumes)
just dev-down        # Stop all services
just dev-logs web    # View logs for a service (api, web, db)
```

`just dev` handles everything: PostgreSQL, migrations, seeding, backend API (port 4001), and frontend (port 3000).

### Running Services Without Docker

```bash
just install         # Install all dependencies (root + web)
just db-up           # Start PostgreSQL only
just db-init         # Run migrations + seed (first time)
just dev-server      # Start backend API (port 4001)
# In another terminal:
just codegen         # Generate GraphQL types (first time or after schema changes)
just dev-web         # Start frontend (port 3000)
```

## Roadmap

Project roadmap lives in `ROADMAP.md` in the repo root. Check it for current priorities and planned work.

## Resources

- Spreadsheet: https://docs.google.com/spreadsheets/d/135dmcPNwvPA8tEuND4-UlUwMmPqpiNZBINoQJH1qJCw/edit
- Monobank API docs: `docs/monobank-api.md`
- Google Sheets API docs: `docs/google-sheets-api.md`

## Spreadsheet Scripts

When you need to manually read or edit the spreadsheet structure (e.g., to understand sheet names, column headers, or add new columns), use the scripts in `scripts/`. See `scripts/README.md` for detailed usage.

**Available scripts:**
- `bun scripts/list-spreadsheet-sheets.ts` - List all sheet names
- `bun scripts/read-spreadsheet-headers.ts <sheetName>` - Read column headers
- `bun scripts/add-spreadsheet-columns.ts <sheetName> <columns...>` - Add new columns

---

## Architecture

### Clean Architecture Layers

```
src/
├── domain/              # Core business logic (innermost layer)
├── application/         # Use cases and orchestration
├── infrastructure/      # External implementations
├── modules/             # Reusable, business-agnostic utilities
├── presentation/        # Entry points (CLI, HTTP, Jobs)
└── main.ts              # Composition root (DI setup)
```

### Dependency Rule

Dependencies MUST point inward:
- `domain` → imports nothing from other layers
- `application` → imports from `domain` only
- `infrastructure` → imports from `domain` and `application`
- `presentation` → imports from `application` (and DI container)

**Never import infrastructure code in domain or application layers.**

### Presentation Layer Patterns

The presentation layer uses base class patterns. See `docs/coding-patterns.md` for full examples.

- **Jobs** (`Job` base class) — Scheduled tasks for Cloud Run. Override `execute()` and `toJobResult()`.
- **Commands** (`Command` base class) — CLI commands with metadata. Auto-registered in `createCLI.ts`.
- **Controllers** (`Controller` base class) — HTTP routes with route definitions. Auto-registered in `controllers/index.ts`.

### Domain Model

Domain entities, value objects, and DTOs are documented in `docs/database-design.md` and `docs/envelope-budgeting.md`. Key entities: Transaction, Account, Category, Budget. Key value objects: Money, Currency, DateRange, TransactionType.

---

## Coding Conventions

### General Rules

1. **No typecasting** — Avoid `as SomeType`. Use type guards, narrowing, and helper methods instead. Exceptions: `as const` and `satisfies` are fine.

2. **Use Zod for validation** — At system boundaries, define schemas alongside DTOs (`type MyDTO = z.infer<typeof myDTOSchema>`). Use `safeParse` for error handling, `parse` when invalid data should throw. **Exception**: GraphQL inputs don't need Zod — GraphQL schema validation is sufficient.

3. **No one-letter variables** — Use descriptive names. Bad: `(s) => s.title`. Good: `(sheet) => sheet.title`. Exception: well-known conventions in very short scopes (`x, y` for coordinates).

4. **Run typecheck and lint after changes**:
   ```bash
   just check   # typecheck + lint
   just fix     # auto-fix issues
   ```

5. **Write and update unit tests** — New files get corresponding tests in `tests/unit/` mirroring the source path. Mock all dependencies. Test: use cases, entities, value objects, mappers, gateways, services. Don't test: abstract interfaces, type definitions, simple DTOs, DI setup, CLI entry points. Run `just test`.

6. **Cover GraphQL endpoints with API integration tests** — New/modified GraphQL queries/mutations need tests in `tests/integration/api/`. **One file per query/mutation** (e.g., `accounts-query.test.ts`, `create-account.test.ts`). Cover: happy path, input validation, error cases, edge cases. Run `just test-api`.

7. **Keep seed data up to date** — When adding features, update `scripts/seed-local-db.ts` so `just dev` provides demo data for every feature.

8. **Clean code and low complexity**:
   - One abstraction level per function — don't mix orchestration with details
   - Keep cognitive complexity low (Biome enforces max 10)
   - Extract meaningful methods from nested loops/conditionals
   - Order methods by reading flow: public entry → helpers in call order
   - Prefer early returns to reduce nesting

### Code Pattern References

For detailed code examples of entities, value objects, repositories, gateways, use cases, modules, DI setup, and presentation layer patterns, see `docs/coding-patterns.md`.

Key rules (summarized):
- **Entities**: Private constructor + static `create()` factory, extend `Entity<TId>`
- **Value Objects**: Immutable, private constructor + static `create()`, encapsulate validation
- **Repositories**: Abstract classes in domain (for DI by type), generic names
- **Gateways**: Return domain objects, mapping is internal to implementation
- **Use Cases**: Extend `UseCase<TRequest, TResponse>`, work only with domain types and DTOs. Use cases don't call other use cases — extract shared logic to services, orchestrate in presentation layer.
- **DI**: TSyringe injection by type using abstract classes, no string tokens. See `container.ts`.
- **External libraries**: Isolated in `src/modules/`. Never import third-party libraries directly outside their wrapper module.

---

## Testing

See `docs/testing-guide.md` for full examples of all test types.

### Test Commands

```bash
just test              # Unit tests
just test-api          # API integration tests (Docker DB)
just test-e2e          # E2E tests (full stack)
just test-e2e-file <path>  # Run a specific E2E test file
just test-e2e-ui       # Interactive Playwright UI
just test-e2e-headed   # Run E2E tests with visible browser
just e2e-down          # Stop E2E environment
just e2e-restart       # Restart E2E environment from scratch
```

### E2E Testing Rules

**NEVER run `bunx playwright test` or `npx playwright test` directly.** E2E tests require an isolated Docker environment (DB on port 5434, API on port 4002, frontend on port 3001). All `just test-e2e*` commands handle starting this environment automatically.

```bash
# Run a specific E2E test:
just test-e2e-file e2e/tests/transactions/verify-transaction.spec.ts

# Run all E2E tests:
just test-e2e

# If E2E environment is broken/stuck:
just e2e-restart
```

### What to Test

| Layer | Test type | Location |
|-------|-----------|----------|
| Domain (entities, VOs) | Unit | `tests/unit/domain/` |
| Application (use cases) | Unit (mock deps) | `tests/unit/application/` |
| GraphQL API | Integration (Docker DB) | `tests/integration/api/` |
| Full stack | E2E (Playwright) | `e2e/tests/` |

### E2E Key Patterns

- Page Objects for all interactions, one scenario per file
- `data-qa` attributes for element selection
- Data factories create test data via GraphQL
- Structure: `e2e/pages/`, `e2e/components/`, `e2e/fixtures/`, `e2e/tests/`

---

## Data Conventions

### Monetary Values

All monetary values in the database are stored in **minor units** (kopecks for UAH, cents for USD/EUR).

**When importing data from external sources, always verify the unit format:**
- **Monobank API**: Returns values in minor units (kopecks) - use as-is
- **Spreadsheet exports**: May store values in major units (UAH) - multiply by 100 before importing
- **Other sources**: Check documentation or sample data to determine format

**Example:**
```
Monobank API: amount = -95000  → -950.00 UAH (already in kopecks)
Spreadsheet:  amount = "950"   → 950.00 UAH (needs × 100 = 95000 kopecks)
```

**Verification tip:** Compare `balance_after` changes with `amount` values. If the ratio is ~100, amounts are in wrong units.

**Amount sign conventions by table:**
- `bank_transactions.amount`: **Signed** (negative for debits, positive for credits) — raw Monobank data
- `transactions.amount`: **Always positive**, `type` column indicates direction (credit/debit)

---

## Key Principles

1. **Domain is pure** — No external dependencies, no infrastructure knowledge
2. **Interfaces as abstract classes** — Enables type-based DI without string tokens
3. **Mappers in infrastructure** — Use cases work only with domain types
4. **Gateways return domain objects** — External formats hidden in implementations
5. **Repositories are generic** — Named `TransactionRepository`, not `SpreadsheetTransactionRepository` in domain
6. **Use cases are generic** — Named `SyncTransactions`, not `SyncFromMonobank`
7. **Use cases don't call other use cases** — Shared logic → services. Orchestration → presentation layer.
8. **Unit tests mock boundaries** — Repositories and gateways are mocked
9. **API integration tests use isolated Docker DB** — GraphQL endpoints tested against real database, no external API mocks
10. **External libraries are isolated** — Wrapped in `src/modules/`, never imported directly elsewhere
