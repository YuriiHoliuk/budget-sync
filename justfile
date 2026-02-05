# Budget Sync - Project Commands
# Install just: brew install just

# Default: show available commands
default:
    @just --list

# ============================================
# Local Development
# ============================================

# Initialize local development environment
init:
    ./scripts/init-local-env.sh

# Install dependencies only
install:
    bun install

# Start full stack (db + api + web) via Docker Compose
dev:
    docker compose up -d

# Stop all services
dev-down:
    docker compose down

# View logs for a service (api, web, db)
dev-logs service='api':
    docker compose logs -f {{service}}

# Start local PostgreSQL database only
db-up:
    docker compose up -d db

# Stop local PostgreSQL database
db-down:
    docker compose down

# Initialize database (migrate + seed) — run after first db-up or db-reset
db-init:
    just db-migrate && just db-seed

# Reset local database (destroy volume, recreate, migrate)
db-reset:
    docker compose down -v && docker compose up -d db && sleep 2 && just db-migrate

# Seed local database with test data
db-seed:
    bun run scripts/seed-local-db.ts

# Run local dev server (API + GraphQL) without Docker
dev-server:
    bun run --watch src/server.ts

# Start Next.js frontend dev server without Docker
dev-web:
    cd web && bun run dev

# Run GraphQL code generation for frontend
codegen:
    cd web && bun run codegen

# Install web frontend dependencies
web-install:
    cd web && bun install

# ============================================
# Sync Commands
# ============================================

# Sync accounts and transactions from Monobank to spreadsheet (CLI)
# Use SYNC_FROM_DATE=YYYY-MM-DD to sync from a specific date (e.g., for backfilling)
sync:
    bun run src/main.ts sync

# Sync from a specific start date (backfill historical data)
sync-from date:
    SYNC_FROM_DATE={{date}} bun run src/main.ts sync

# Run sync-accounts job locally
job-sync-accounts:
    bun run src/jobs/sync-accounts.ts

# Run process-webhooks job locally
job-process-webhooks:
    bun run src/jobs/process-webhooks.ts

# Run a job with debug logging
job-debug job='sync-accounts':
    DEBUG=* bun run src/jobs/{{job}}.ts

# ============================================
# Code Quality
# ============================================

# Run all checks (typecheck + lint)
check:
    bun run typecheck && bun run check

# Fix lint and format issues
fix:
    bun run check:fix

# Run unit tests
test:
    bun test tests/unit

# Typecheck, fix lint/format, run tests
verify:
    bun run typecheck && bun run check:fix && bun test tests/unit

# Run tests in watch mode
test-watch:
    bun test --watch tests/unit

# Run integration tests (uses real APIs)
test-integration:
    bun test tests/integration

# Run tests with coverage
test-coverage:
    bun test --coverage tests/unit

# ============================================
# Database Commands
# ============================================

# Generate database migration files from schema changes
db-generate:
    bunx drizzle-kit generate

# Run pending database migrations
db-migrate:
    bunx drizzle-kit migrate

# Open Drizzle Studio for database inspection
db-studio:
    bunx drizzle-kit studio

# ============================================
# Google Cloud Commands
# ============================================

# Set GCP project
gcp-set-project:
    gcloud config set project budget-sync-483105

# List all Cloud Run jobs and services
gcp-list:
    @echo "=== Cloud Run Jobs ===" && \
    gcloud run jobs list --region=europe-central2 --format="table(name,status)" && \
    echo "" && \
    echo "=== Cloud Run Services ===" && \
    gcloud run services list --region=europe-central2 --format="table(name,URL)"

# View job executions (default: sync-accounts, or specify job=process-webhooks)
gcp-logs job='sync-accounts':
    gcloud run jobs executions list --job={{job}} --region=europe-central2 --limit=5

# Execute a Cloud Run job (default: sync-accounts)
gcp-run job='sync-accounts':
    gcloud run jobs execute {{job}} --region=europe-central2 --wait

# View Cloud Scheduler jobs
gcp-scheduler:
    gcloud scheduler jobs list --location=europe-central2

# Trigger a scheduler job (default: sync-accounts-scheduler)
gcp-trigger scheduler='sync-accounts-scheduler':
    gcloud scheduler jobs run {{scheduler}} --location=europe-central2

# Describe a Cloud Run job
gcp-describe-job job='sync-accounts':
    gcloud run jobs describe {{job}} --region=europe-central2

# Describe a Cloud Run service
gcp-describe-service service='webhook':
    gcloud run services describe {{service}} --region=europe-central2

# View webhook service logs
gcp-webhook-logs:
    gcloud run services logs read webhook --region=europe-central2 --limit=50

# View secret versions
gcp-secrets:
    gcloud secrets list

# ============================================
# Docker (local testing)
# ============================================

# Build Docker image locally
docker-build:
    docker build -t budget-sync:local .

# Run sync-accounts job in Docker
docker-run-sync-accounts:
    docker run --rm \
        -e MONOBANK_TOKEN=$(grep MONOBANK_TOKEN .env | cut -d= -f2) \
        -e SPREADSHEET_ID=$(grep SPREADSHEET_ID .env | cut -d= -f2) \
        -v $(pwd)/service-account.json:/app/service-account.json:ro \
        -e GOOGLE_SERVICE_ACCOUNT_FILE=/app/service-account.json \
        budget-sync:local src/jobs/sync-accounts.ts

# Run process-webhooks job in Docker
docker-run-process-webhooks:
    docker run --rm \
        -e MONOBANK_TOKEN=$(grep MONOBANK_TOKEN .env | cut -d= -f2) \
        -e SPREADSHEET_ID=$(grep SPREADSHEET_ID .env | cut -d= -f2) \
        -e PUBSUB_SUBSCRIPTION=webhook-transactions-sub \
        -e GCP_PROJECT_ID=budget-sync-483105 \
        -v $(pwd)/service-account.json:/app/service-account.json:ro \
        -e GOOGLE_SERVICE_ACCOUNT_FILE=/app/service-account.json \
        budget-sync:local src/jobs/process-webhooks.ts

# =============================================================================
# Terraform Commands (local development only)
# =============================================================================
# NOTE: Production changes are applied automatically via CI/CD when you push
# to main. These commands are for local debugging and development only.

# Initialize Terraform (required before other tf-* commands)
tf-init:
    cd terraform && terraform init

# Preview what would change (read-only, safe to run anytime)
tf-plan:
    cd terraform && terraform plan

# Format Terraform files before committing
tf-fmt:
    cd terraform && terraform fmt -recursive

# Validate Terraform configuration syntax
tf-validate:
    cd terraform && terraform validate

# Show current state (what Terraform thinks exists)
tf-state:
    cd terraform && terraform state list

# Show details of a specific resource
tf-show resource:
    cd terraform && terraform state show {{resource}}

# ============================================
# Tools
# ============================================

# Run Ralph Loop (autonomous Claude Code loop)
# Usage: just ralph [options]
# Examples:
#   just ralph                              # Default: PROMPT.md, opus, 100 iterations
#   just ralph "-p TODO.md --model sonnet"  # Custom prompt file and model
#   just ralph "--mock"                     # Test with mock Claude
ralph args='':
    cd tools/ralph && bun run src/index.ts -p "{{justfile_directory()}}/PROMPT.md" --cwd "{{justfile_directory()}}" {{args}}
