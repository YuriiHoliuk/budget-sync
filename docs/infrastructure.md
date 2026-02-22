---
description: GCP and Neon infrastructure reference for budget-sync, covering Terraform-managed resources, service accounts, CI/CD pipelines, and the external database.
---

# Infrastructure

Project: `budget-sync-483105` | Region: `europe-central2` (Warsaw)

## GCP Resources Overview

### Cloud Run Services

| Service | Type | Purpose | Public |
|---------|------|---------|--------|
| `webhook` | Service (always-on, 1-2 instances, CPU throttled) | HTTP endpoint for Monobank webhooks and transaction processing | Yes |
| `web` | Service (always-on, 0-2 instances) | Next.js frontend application | Yes |
| `sync-accounts` | Job (scheduled) | Syncs accounts and transactions from Monobank | N/A |

All Cloud Run workloads run with 1 CPU / 512Mi memory and use the `budget-sync-runner` service account. The webhook service has `cpu_idle = true` (CPU deallocated when idle) and `startup_cpu_boost = true` (extra CPU during startup) to reduce costs while keeping the instance warm in memory (`minScale=1`).

### Cloud Scheduler

| Job | Schedule | Target |
|-----|----------|--------|
| `sync-accounts-scheduler` | `0 */3 * * *` (every 3 hours) | Triggers the `sync-accounts` Cloud Run Job via HTTP (also re-registers webhook) |

Uses the `budget-sync-scheduler` service account with `roles/run.invoker`.

### Artifact Registry

A single Docker repository `budget-sync` in `europe-central2` stores all container images:

- `budget-sync` -- backend image (used by `sync-accounts` job and `webhook` service)
- `budget-sync-web` -- frontend image (used by `web` service)

### Secret Manager

Terraform manages secret **metadata** (existence, labels, replication). Secret **values** are added manually via `gcloud secrets versions add`.

| Secret | Used By |
|--------|---------|
| `monobank-token` | `sync-accounts`, `webhook` |
| `spreadsheet-id` | `sync-accounts`, `webhook` |
| `gemini-api-key` | `sync-accounts`, `webhook` |
| `database-url` | `sync-accounts`, `webhook` |
| `allowed-email` | `web` (build-time via CI) |
| `allowed-password` | `web` (build-time via CI) |

### Pub/Sub

Used for asynchronous transaction processing and categorization:

**Webhook Transaction Queue** — receives Monobank webhook events for transaction processing:

| Resource | Name | Purpose |
|----------|------|---------|
| Topic | `webhook-transactions` | Receives Monobank webhook events |
| Subscription | `webhook-transactions-sub` | Push delivery to `webhook` service at `/webhook/process` |
| Topic | `webhook-transactions-dlq` | Dead letter queue for failed messages |
| Subscription | `webhook-transactions-dlq-sub` | Pull subscription for inspecting failed messages |

**Categorization Queue** — decouples LLM-based categorization from transaction processing to handle Gemini API rate limits:

| Resource | Name | Purpose |
|----------|------|---------|
| Topic | `categorization-queue` | Receives categorization requests after transaction is saved |
| Subscription | `categorization-queue-sub` | Push delivery to `webhook` service at `/webhook/categorize` |
| Topic | `categorization-queue-dlq` | Dead letter queue for failed categorizations |
| Subscription | `categorization-queue-dlq-sub` | Pull subscription for inspecting failed messages |

Both queues retry up to 5 times with exponential backoff (10s-600s) before going to the DLQ. The categorization queue uses a 120s ack deadline (vs 60s for webhooks) to allow for LLM response time.

**Flow**: Webhook → save transaction → enqueue categorization → return 200. Pub/Sub pushes to `/webhook/categorize` which calls `CategorizeTransactionUseCase`. Rate limit errors return 500, triggering Pub/Sub's exponential backoff retry.

### Terraform State

Stored in GCS bucket `budget-sync-terraform-state` with versioning enabled.

## Service Accounts and IAM

### `budget-sync-runner`

Runs all Cloud Run workloads. Roles:

| Role | Scope | Purpose |
|------|-------|---------|
| `roles/secretmanager.secretAccessor` | Project | Read secret values at runtime |
| `roles/pubsub.publisher` | `webhook-transactions` topic | Publish webhook messages |
| `roles/pubsub.subscriber` | `webhook-transactions-sub` | Process messages from subscription |
| `roles/pubsub.subscriber` | `webhook-transactions-dlq-sub` | Inspect failed messages |
| `roles/pubsub.publisher` | `categorization-queue` topic | Publish categorization requests |
| `roles/pubsub.subscriber` | `categorization-queue-sub` | Process categorization messages |
| `roles/pubsub.subscriber` | `categorization-queue-dlq-sub` | Inspect failed categorizations |

### `budget-sync-scheduler`

Triggers Cloud Run Jobs on schedule. Roles:

| Role | Scope | Purpose |
|------|-------|---------|
| `roles/run.invoker` | Project | Trigger Cloud Run Jobs |

### `budget-sync-deployer`

Used by GitHub Actions for CI/CD and Terraform. Roles:

| Role | Scope | Purpose |
|------|-------|---------|
| `roles/run.admin` | Project | Deploy Cloud Run services and jobs |
| `roles/artifactregistry.writer` | Project | Push Docker images |
| `roles/iam.serviceAccountUser` | Project | Attach service accounts to workloads |
| `roles/iam.serviceAccountAdmin` | Project | Manage service accounts (Terraform) |
| `roles/secretmanager.admin` | Project | Manage secrets (Terraform) |
| `roles/cloudscheduler.admin` | Project | Manage scheduler jobs (Terraform) |
| `roles/pubsub.admin` | Project | Manage Pub/Sub topics and subscriptions (Terraform) |
| `roles/resourcemanager.projectIamAdmin` | Project | Manage IAM bindings (Terraform) |
| `roles/storage.admin` | `budget-sync-terraform-state` bucket | Read/write Terraform state |

## Terraform-Managed vs Non-Managed

### Managed by Terraform (`terraform/`)

- Service accounts and all IAM bindings
- Artifact Registry repository
- Secret Manager secrets (metadata only, not values)
- Cloud Run Job (`sync-accounts`) and Services (`webhook`, `web`)
- Cloud Scheduler job (`sync-accounts-scheduler`)
- Pub/Sub topics, subscriptions, and their IAM bindings
- Terraform state bucket IAM

### NOT Managed by Terraform

- **Docker image tags** -- updated by `gcloud` CLI in the Deploy workflow; Terraform uses `lifecycle.ignore_changes` to avoid reverting them
- **Secret values** -- add via `gcloud secrets versions add <secret> --data-file=-`
- **GCP API enablement** -- one-time setup, not codified
- **Neon PostgreSQL database** -- external service, not a GCP resource
- **Database schema/migrations** -- managed by Drizzle ORM, applied in the Deploy workflow
- **DNS / custom domains** -- not configured

### Terraform Files

```
terraform/
  provider.tf    # Google provider (~> 5.0), GCS backend
  variables.tf   # project_id, region, image_tag
  main.tf        # All resource definitions
  outputs.tf     # URLs, service account emails, resource names
  imports.tf     # Import blocks for pre-existing resources
```

State backend: `gs://budget-sync-terraform-state/terraform/state`

## CI/CD Pipelines

Two GitHub Actions workflows handle all automation. Authentication uses `google-github-actions/auth@v2` with the `GCP_SA_KEY` secret (deployer service account key). gcloud CLI is pre-installed on GitHub runners -- no `setup-gcloud` action needed.

### CI/CD (`ci.yml`)

**Trigger**: Every push and PR to `main`, or `workflow_dispatch`.

On PRs: runs tests only (lint, unit, API integration, E2E). On `main`: runs tests, then conditionally builds and deploys.

Docker builds use `docker/build-push-action@v6` with BuildKit and GitHub Actions cache (`type=gha`) for layer caching across runs.

| Stage | Condition | What it does |
|-------|-----------|-------------|
| Test | Always | Lint, typecheck, unit tests |
| Test API | Always | API integration tests against isolated Docker DB |
| Test E2E | Always | Full-stack E2E tests with Playwright (4 workers, production build) |
| Check | Main only, after tests pass | Determines if backend and/or web files changed |
| Migrate | Backend or web changed | Fetches `database-url` secret, runs `bunx drizzle-kit migrate` |
| Build Backend | Backend files changed | Builds and pushes `budget-sync` image (BuildKit + GHA cache) |
| Build Web | Web files changed | Builds and pushes `budget-sync-web` image (BuildKit + GHA cache) |
| Deploy Backend | Backend built + migrated | Updates `sync-accounts` job and `webhook` service via `gcloud run` |
| Deploy Web | Web built + migrated | Updates `web` service via `gcloud run` |
| Cleanup | After successful deploy | Deletes old images from Artifact Registry (keeps latest 2) |

Image tags use the git commit SHA.

### Terraform (`terraform.yml`)

**Trigger**: Push or PR to `main` when `terraform/**` files change.

| Stage | Runs on | What it does |
|-------|---------|-------------|
| Validate | Push + PR | `terraform init`, `fmt -check`, `validate` |
| Plan | Push + PR | `terraform plan`, uploads plan artifact |
| Apply | Push to `main` only | Downloads plan artifact, `terraform apply -auto-approve` |

## Neon PostgreSQL (External Database)

The production database is hosted on **Neon Serverless PostgreSQL** in `aws-eu-central-1` (Frankfurt), external to GCP. It is not managed by Terraform.

- **Region**: `aws-eu-central-1` (Frankfurt) -- close to Cloud Run in Warsaw (`europe-central2`)
- **Connection**: The `DATABASE_URL` is stored in Secret Manager and injected into Cloud Run workloads at runtime
- **Connection string format**: `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
- **Schema management**: Drizzle ORM with migrations applied during CI/CD deploys (see Deploy workflow)
- **Local development**: Uses a local PostgreSQL 16 container via Docker Compose on port 5432

### Why External

Neon provides serverless scale-to-zero, database branching, and a generous free tier. The connection string is the only integration point -- the app uses standard PostgreSQL drivers with no Neon-specific SDKs.

## Making Infrastructure Changes

1. Edit `.tf` files in `terraform/`
2. Optionally run `just tf-plan` locally to preview
3. Run `just tf-fmt` to format
4. Create a PR -- the Terraform workflow shows the plan
5. Merge to `main` -- the Terraform workflow applies changes automatically

There is intentionally no local `terraform apply` command. All applies go through CI/CD.

### Local Commands

```bash
just tf-init       # Initialize Terraform (required once)
just tf-plan       # Preview changes (read-only, safe)
just tf-fmt        # Format files before committing
just tf-validate   # Check syntax
just tf-state      # List managed resources
```
