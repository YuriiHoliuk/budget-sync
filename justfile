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

# Run in development mode (watch)
dev:
    bun run dev

# ============================================
# Sync Commands
# ============================================

# Sync accounts and transactions from Monobank to spreadsheet (CLI)
sync:
    bun run src/main.ts sync

# Run sync-monobank job locally
job:
    bun run src/jobs/sync-monobank.ts

# Run sync-monobank job with debug logging
job-debug:
    DEBUG=* bun run src/jobs/sync-monobank.ts

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
# Google Cloud Commands
# ============================================

# Set GCP project
gcp-set-project:
    gcloud config set project budget-sync-483105

# View sync-transactions job logs
gcp-logs:
    gcloud run jobs executions list --job=sync-transactions --region=europe-central2 --limit=5

# Manually execute sync-transactions job
gcp-run:
    gcloud run jobs execute sync-transactions --region=europe-central2 --wait

# View Cloud Scheduler jobs
gcp-scheduler:
    gcloud scheduler jobs list --location=europe-central2

# Trigger scheduler job immediately
gcp-trigger:
    gcloud scheduler jobs run sync-transactions-scheduler --location=europe-central2

# View deployed job details
gcp-describe:
    gcloud run jobs describe sync-transactions --region=europe-central2

# View secret versions
gcp-secrets:
    gcloud secrets list

# ============================================
# Docker (local testing)
# ============================================

# Build sync-monobank Docker image locally
docker-build:
    docker build -f docker/Dockerfile.sync-monobank -t sync-monobank:local .

# Run sync-monobank job in Docker (same as production)
docker-run:
    docker run --rm \
        -e MONOBANK_TOKEN=$(grep MONOBANK_TOKEN .env | cut -d= -f2) \
        -e SPREADSHEET_ID=$(grep SPREADSHEET_ID .env | cut -d= -f2) \
        -v $(pwd)/service-account.json:/app/service-account.json:ro \
        -e GOOGLE_SERVICE_ACCOUNT_FILE=/app/service-account.json \
        sync-monobank:local

