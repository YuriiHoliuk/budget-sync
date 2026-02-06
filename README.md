# Budget Sync

Personal finance management tool for tracking spendings, income, capital, and budgeting. Built similar to You Need A Budget (YNAB) with budget categories, allocations, and transaction tracking.

## Features

- **Budget Management**: Create spending, savings, and goal budgets with allocations
- **Transaction Sync**: Automatic sync from Monobank API via webhooks
- **Web Interface**: Modern React frontend for managing budgets and transactions
- **GraphQL API**: Full-featured API for all budget operations
- **AI Categorization**: Automatic transaction categorization using Gemini
- **Multi-Account**: Track multiple bank accounts (synced and manual)

## Tech Stack

### Backend
- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL (Neon in production)
- **API**: GraphQL with Apollo Server
- **Architecture**: Clean Architecture
- **DI**: TSyringe

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI Components**: ShadCN UI (new-york style)
- **Styling**: Tailwind CSS v4
- **State/Data**: Apollo Client with GraphQL
- **Code Generation**: GraphQL Codegen

### Infrastructure
- **Deployment**: Google Cloud Run
- **CI/CD**: GitHub Actions
- **Scheduling**: Cloud Scheduler

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Just](https://github.com/casey/just) command runner: `brew install just`
- [Docker](https://www.docker.com/) (for local PostgreSQL)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (for cloud features)

### Local Development Setup

```bash
# 1. Install dependencies
bun install
cd web && bun install && cd ..

# 2. Start local PostgreSQL
just db-up

# 3. Run database migrations
just db-migrate

# 4. Seed test data (optional but recommended)
just db-seed

# 5. Generate GraphQL types for frontend
just codegen

# 6. Start backend API server (port 4001)
just dev-server

# 7. In another terminal, start frontend (port 3000)
just dev-web
```

### Environment Variables

Backend `.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/budget_sync
MONOBANK_TOKEN=your_monobank_token
SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
GEMINI_API_KEY=your_gemini_api_key
```

Frontend `web/.env.local` (copy from `web/.env.example`):
```
API_URL=http://localhost:4001
NEXT_PUBLIC_ALLOWED_EMAIL=your@email.com
NEXT_PUBLIC_ALLOWED_PASSWORD=your_password
```

## Commands

Run `just` to see all available commands.

### Development

```bash
just install          # Install dependencies
just dev-server       # Start backend API (port 4001)
just dev-web          # Start frontend (port 3000)
just codegen          # Generate GraphQL types
just check            # Run typecheck + lint (backend + frontend)
just fix              # Auto-fix lint/format issues
```

### Database

```bash
just db-up            # Start PostgreSQL container
just db-down          # Stop PostgreSQL container
just db-migrate       # Run migrations
just db-seed          # Seed test data
```

### Testing

```bash
just test             # Run unit tests
just test-watch       # Run tests in watch mode
just test-api         # Run API integration tests
just test-e2e         # Run E2E tests (Playwright)
just test-e2e-ui      # Run E2E tests with UI
just test-e2e-headed  # Run E2E tests in headed browser
just e2e-report       # Show E2E test report
```

### Sync Operations

```bash
just sync              # Sync accounts and transactions from Monobank (CLI)
just job               # Run Cloud Run job locally
just job-debug         # Run job with debug logging
```

### Google Cloud

```bash
just gcp-set-project   # Set active GCP project
just gcp-run           # Manually run sync-accounts job
just gcp-logs          # View recent job executions
just gcp-scheduler     # View scheduled jobs
just gcp-secrets       # List secrets
```

## Project Structure

```
src/
├── domain/              # Core business logic (entities, value objects)
├── application/         # Use cases and orchestration
├── infrastructure/      # External implementations (DB, APIs)
├── modules/             # Reusable utilities (spreadsheet, http)
└── presentation/        # Entry points (CLI, HTTP, GraphQL)

web/
├── src/app/             # Next.js pages (App Router)
├── src/components/      # React components
├── src/graphql/         # GraphQL operations (.graphql files)
└── src/lib/             # Utilities and Apollo Client setup

e2e/
├── pages/               # Page Object Model classes
├── components/          # Reusable test components
├── fixtures/            # Test fixtures and factories
└── tests/               # E2E test specs
```

## Testing

### Unit Tests
```bash
just test                              # Run all unit tests
bun test tests/unit/domain             # Run specific directory
bun test tests/unit/domain/Money.test.ts  # Run specific file
```

### API Integration Tests
```bash
just test-api                          # Run all API tests
bun test tests/integration/api/budgets.test.ts  # Run specific test
```

### E2E Tests (Playwright)
```bash
just test-e2e                          # Run all E2E tests
just test-e2e-ui                       # Interactive UI mode
just test-e2e-headed                   # Watch tests run in browser
just test-e2e-file e2e/tests/smoke.spec.ts  # Run specific file
just e2e-report                        # View HTML report
```

E2E tests use:
- Isolated environment via `docker-compose.e2e.yml`
- Page Object Model pattern in `e2e/pages/`
- Reusable components in `e2e/components/`
- Data factories for creating test entities

## Deployment

The project is deployed to Google Cloud Run with automated CI/CD via GitHub Actions.

### Architecture

```
GitHub Actions → Artifact Registry → Cloud Run
                                          ↑
Cloud Scheduler (cron) ──────────────────┘
                                          ↓
                                   Secret Manager
                                          ↓
                    PostgreSQL (Neon) + Monobank API + Google Sheets
```

### Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| sync-accounts | Every 3 hours | Sync accounts from Monobank |

### GCP Resources

- **Project**: `budget-sync-483105`
- **Region**: `europe-central2` (Warsaw)
- **Database**: Neon PostgreSQL (external)

### Service Accounts

| Account | Purpose |
|---------|---------|
| `budget-sync-runner` | Runs Cloud Run Jobs, accesses Sheets API |
| `budget-sync-scheduler` | Triggers jobs on schedule |
| `budget-sync-deployer` | GitHub Actions deployment |

## Resources

- [Spreadsheet](https://docs.google.com/spreadsheets/d/135dmcPNwvPA8tEuND4-UlUwMmPqpiNZBINoQJH1qJCw/edit)
- [Cloud Console](https://console.cloud.google.com/run/jobs?project=budget-sync-483105)
- [GitHub Actions](../../actions)
