# Budget Sync

Personal finance management tool for tracking spendings, income, capital, and budgeting.

## Features

- Sync transactions from Monobank API
- Store data in Google Spreadsheet
- Track expenses by categories
- Budget management
- Automated sync via Cloud Scheduler (every 2 hours)

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Architecture**: Clean Architecture
- **DI**: TSyringe
- **Deployment**: Google Cloud Run Jobs
- **Scheduling**: Cloud Scheduler

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Just](https://github.com/casey/just) command runner: `brew install just`
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (for cloud features)

### Setup

```bash
# If you have gcloud authenticated with the project:
just init

# Or manually:
bun install
# Create .env file with required variables (see below)
```

### Environment Variables

Create a `.env` file:

```
MONOBANK_TOKEN=your_monobank_token
SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_FILE=service-account.json
```

## Commands

Run `just` to see all available commands.

### Development

```bash
just install          # Install dependencies
just dev              # Run with watch mode
just check            # Run typecheck + lint
just fix              # Auto-fix lint/format issues
just test             # Run unit tests
just test-watch       # Run tests in watch mode
just test-integration # Run integration tests (real APIs)
```

### Sync Operations

```bash
just sync              # Sync accounts and transactions from Monobank (CLI)
just job               # Run Cloud Run job locally
just job-debug         # Run job with debug logging (DEBUG=*)
```

### Google Cloud

```bash
just gcp-set-project   # Set active GCP project
just gcp-run           # Manually run sync-accounts job
just gcp-logs          # View recent job executions
just gcp-scheduler     # View scheduled jobs
just gcp-secrets       # List secrets
```

### Docker (local testing)

```bash
just docker-build      # Build image locally
just docker-run        # Run sync in Docker
```

## Project Structure

```
src/
├── domain/           # Core business logic
├── application/      # Use cases
├── infrastructure/   # External implementations
├── modules/          # Reusable utilities
└── presentation/     # CLI entry points
```

## Deployment

The project is deployed to Google Cloud Run Jobs with automated CI/CD via GitHub Actions.

### Architecture

```
GitHub Actions → Artifact Registry → Cloud Run Jobs
                                          ↑
Cloud Scheduler (cron) ──────────────────┘
                                          ↓
                                   Secret Manager
                                          ↓
                              Monobank API + Google Sheets
```

### Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| sync-accounts | Every 3 hours | Sync accounts from Monobank |

### Manual Deployment

Push to `main` branch triggers automatic deployment. For manual execution:

```bash
# Execute job manually
gcloud run jobs execute sync-accounts --region=europe-central2

# Trigger scheduler immediately
gcloud scheduler jobs run sync-accounts-scheduler --location=europe-central2
```

### GCP Resources

- **Project**: `budget-sync-483105`
- **Region**: `europe-central2` (Warsaw)
- **Artifact Registry**: `europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync`

### Service Accounts

| Account | Purpose |
|---------|---------|
| `budget-sync-runner` | Runs Cloud Run Jobs |
| `budget-sync-scheduler` | Triggers jobs on schedule |
| `budget-sync-deployer` | GitHub Actions deployment |

## Spreadsheet Scripts

Helper scripts for managing the Google Spreadsheet schema:

```bash
bun scripts/list-spreadsheet-sheets.ts           # List all sheets
bun scripts/read-spreadsheet-headers.ts <sheet>  # Read column headers
bun scripts/add-spreadsheet-columns.ts <sheet> <col1> <col2>  # Add columns
```

## Resources

- [Spreadsheet](https://docs.google.com/spreadsheets/d/135dmcPNwvPA8tEuND4-UlUwMmPqpiNZBINoQJH1qJCw/edit)
- [Cloud Console](https://console.cloud.google.com/run/jobs?project=budget-sync-483105)
- [GitHub Actions](../../actions)
