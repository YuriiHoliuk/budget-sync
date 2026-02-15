---
description: CI/CD pipeline, Docker builds, and Cloud Run deployment operations.
---

# Deployment

This document covers the deployment pipeline and operational procedures. For infrastructure definitions (Terraform resources, IAM, etc.), see the `terraform/` directory and CLAUDE.md.

## Overview

The project deploys two Docker images to Google Cloud Run in `europe-central2` (Warsaw):

| Component | Image | Cloud Run Resource | Dockerfile |
|-----------|-------|--------------------|------------|
| Backend | `budget-sync` | Job: `sync-accounts`, Service: `webhook` | `Dockerfile` |
| Web Frontend | `budget-sync-web` | Service: `web` | `Dockerfile.web` |

Both images are stored in Artifact Registry at `europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/`.

## CI/CD Pipeline

Two GitHub Actions workflows handle everything:

### 1. CI/CD (`ci.yml`)

Triggers on every push and PR to `main`, or manually via `workflow_dispatch`. On PRs, runs tests only. On `main`, runs tests then conditionally builds and deploys.

Authentication uses `google-github-actions/auth@v2` (gcloud is pre-installed on GitHub runners, no `setup-gcloud` needed). Docker builds use `docker/build-push-action@v6` with BuildKit and GitHub Actions cache (`type=gha`) for layer caching across runs.

### 2. Terraform (`terraform.yml`)

Triggers only when `terraform/**` files change. On PRs it runs `plan`; on merge to `main` it runs `apply`. This manages infrastructure independently from application deploys.

#### Pipeline Stages

```
Check (change detection)
  |
  +--> Migrate (database migrations via drizzle-kit)
  |
  +--> Build Backend ----> Deploy Backend ---+
  |                                          +--> Cleanup (old images)
  +--> Build Web --------> Deploy Web -------+
                                             |
                                             +--> Summary
```

#### Change Detection

The `check` job compares the last commit to determine what needs deploying:

- **Backend triggers**: `src/`, `drizzle/`, `package.json`, `bun.lock`, `Dockerfile`, `tsconfig.json`
- **Web triggers**: `src/`, `web/`, `package.json`, `bun.lock`, `docker/`, `Dockerfile.web`, `tsconfig.json`

If no relevant files changed, the corresponding build and deploy jobs are skipped entirely.

#### Database Migrations

Migrations run before any deploy if either backend or web has changes. The workflow fetches `DATABASE_URL` from Secret Manager and executes `bunx drizzle-kit migrate`.

#### Image Tagging

Images are tagged with the Git commit SHA:

```
europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync:<sha>
europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync-web:<sha>
```

#### Image Cleanup

After a successful deploy, the cleanup job deletes all but the 2 most recent images from Artifact Registry to save storage.

## Docker Build Process

### Backend (`Dockerfile`)

Three-stage build using `oven/bun`:

1. **deps** -- Installs production dependencies only (`--production`)
2. **builder** -- Full install + typecheck (validates the build)
3. **runtime** (`bun:1-alpine`) -- Copies production `node_modules` and source files. Bun runs TypeScript directly, so no compile step is needed.

The image uses a single entrypoint (`bun run`) with the specific job file passed as `CMD`/`args`:

```
ENTRYPOINT ["bun", "run"]
CMD ["src/jobs/sync-accounts.ts"]
```

Cloud Run overrides the args per resource (e.g., `src/jobs/webhook-server.ts` for the webhook service).

### Web Frontend (`Dockerfile.web`)

Three-stage build:

1. **deps** -- Installs web dependencies from `web/`
2. **builder** -- Copies backend GraphQL schema files (needed for codegen), runs `bun run codegen`, then builds Next.js in standalone mode. Build-time args are baked in: `NEXT_PUBLIC_ALLOWED_EMAIL`, `NEXT_PUBLIC_ALLOWED_PASSWORD`, `API_URL`.
3. **runtime** (`node:22-alpine`) -- Copies the Next.js standalone output. Runs `node web/server.js`.

The `API_URL` build arg is resolved during CI by querying the existing webhook service URL from Cloud Run.

## Environment Variables and Secrets

### Secret Manager Secrets

Secrets are managed in GCP Secret Manager. Terraform creates the secret resources; values are added manually via `gcloud`.

| Secret | Used By |
|--------|---------|
| `monobank-token` | Backend (sync-accounts job, webhook service) |
| `spreadsheet-id` | Backend (sync-accounts job, webhook service) |
| `gemini-api-key` | Backend (sync-accounts job, webhook service) |
| `database-url` | Backend (sync-accounts job, webhook service), CI migrations |
| `allowed-email` | Web (baked at build time) |
| `allowed-password` | Web (baked at build time) |

To add or update a secret value:

```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

### GitHub Actions Secrets

| Secret | Purpose |
|--------|---------|
| `GCP_SA_KEY` | Service account JSON key for the `budget-sync-deployer` account |
| `ALLOWED_EMAIL` | Passed as build arg for web frontend |
| `ALLOWED_PASSWORD` | Passed as build arg for web frontend |

### Runtime Environment

Backend Cloud Run resources receive secrets as environment variables via Secret Manager references (configured in Terraform). The web frontend has its auth credentials baked into the image at build time.

## Cloud Scheduler

The `sync-accounts-scheduler` Cloud Scheduler job triggers the `sync-accounts` Cloud Run job:

- **Schedule**: Every 3 hours (`0 */3 * * *` UTC)
- **Retry**: Up to 3 retries with exponential backoff (5s to 3600s)
- **Deadline**: 1800s (30 minutes)
- **Auth**: Uses the `budget-sync-scheduler` service account with OAuth token

## Manual Deployment

### Trigger the Deploy Workflow

Go to GitHub Actions and run the "Deploy" workflow manually via `workflow_dispatch`. This deploys the current `main` branch.

### Deploy a Specific Image via gcloud

To update a job or service image directly:

```bash
# Deploy backend job
gcloud run jobs update sync-accounts \
  --image=europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync:<sha> \
  --region=europe-central2

# Deploy backend service
gcloud run services update webhook \
  --image=europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync:<sha> \
  --region=europe-central2

# Deploy web service
gcloud run services update web \
  --image=europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync-web:<sha> \
  --region=europe-central2
```

### Manually Execute a Job

```bash
just gcp-run                          # Execute sync-accounts job
just gcp-run job=process-webhooks     # Execute a different job
just gcp-trigger                      # Trigger via Cloud Scheduler
```

### Run Database Migrations Manually

```bash
DATABASE_URL=$(gcloud secrets versions access latest --secret=database-url --project=budget-sync-483105)
DATABASE_URL="$DATABASE_URL" bunx drizzle-kit migrate
```

## Rollback

There is no dedicated rollback mechanism. To roll back, redeploy a previous image:

1. Find the previous image SHA from the Git log or Artifact Registry:

   ```bash
   gcloud artifacts docker images list \
     europe-central2-docker.pkg.dev/budget-sync-483105/budget-sync/budget-sync \
     --sort-by=CREATE_TIME
   ```

2. Deploy the previous image using the gcloud commands above.

3. If a database migration needs reverting, write and apply a reverse migration manually. Drizzle does not support automatic rollback.

Note: The cleanup job keeps only the 2 most recent images. If you need to roll back further, rebuild from the older commit.

## Useful Commands

```bash
# Check what is currently deployed
just gcp-list                          # List all jobs and services
just gcp-describe-job                  # Details of sync-accounts job
just gcp-describe-service              # Details of webhook service
just gcp-describe-service service=web  # Details of web service

# View logs
just gcp-logs                          # Recent sync-accounts executions
just gcp-webhook-logs                  # Webhook service logs

# View scheduler
just gcp-scheduler                     # List scheduled jobs

# View secrets
just gcp-secrets                       # List all secrets
```
