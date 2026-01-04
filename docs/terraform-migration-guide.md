# Terraform Migration Guide

This guide provides step-by-step tasks to migrate budget-sync infrastructure from gcloud CLI scripts to Terraform.

---

## How Terraform Works

This section explains Terraform concepts for engineers familiar with software development but new to Infrastructure as Code.

### The Core Concept

Think of Terraform like a **declarative build system for infrastructure**. Instead of writing imperative scripts that say "do this, then do that," you describe the desired end state: "I want these resources to exist with these properties."

```
Traditional approach (imperative):
1. Check if service account exists
2. If not, create it
3. Check if IAM binding exists
4. If not, add it
5. Hope nothing changed in between

Terraform approach (declarative):
"I want a service account named X with role Y"
→ Terraform figures out what to create/update/delete
```

### Key Components

**Configuration Files (.tf)**

HCL (HashiCorp Configuration Language) files that describe your infrastructure. Similar to how `package.json` describes your dependencies, `.tf` files describe your cloud resources.

```hcl
resource "google_service_account" "runner" {
  account_id   = "budget-sync-runner"
  display_name = "Budget Sync Runner"
}
```

**State File (terraform.tfstate)**

A JSON file that tracks what Terraform has created. This is Terraform's "memory" - it knows that the service account in GCP corresponds to the resource block in your config.

```
Your Config (.tf)          State File              GCP
┌──────────────────┐      ┌─────────────┐      ┌─────────────┐
│ service_account  │ ←──→ │ ID: abc123  │ ←──→ │ Actual SA   │
│ "runner"         │      │ name: runner│      │ in GCP      │
└──────────────────┘      └─────────────┘      └─────────────┘
```

Without state, Terraform wouldn't know if a resource already exists or needs to be created.

**The Plan/Apply Cycle**

```
terraform plan    →  "Here's what I would change" (preview, safe)
terraform apply   →  "Now I'm making those changes" (executes)
```

This is like `git diff` vs `git commit` - you always see what will happen before it happens.

### How Changes Are Detected

When you run `terraform plan`, Terraform:

1. Reads your `.tf` files (desired state)
2. Reads the state file (known state)
3. Queries GCP APIs (actual state)
4. Computes the diff between desired and actual
5. Shows you what needs to change

```
┌─────────────────┐
│ Config (.tf)    │──→ Desired State
└─────────────────┘
         ↓
    ┌─────────┐     ┌─────────────┐
    │ Compare │ ←── │ State File  │──→ Known State
    └─────────┘     └─────────────┘
         ↓                ↑
    ┌─────────┐     ┌─────────────┐
    │  Plan   │ ←── │  GCP APIs   │──→ Actual State
    └─────────┘     └─────────────┘
         ↓
    Create/Update/Delete actions
```

### State Backend

By default, state is stored locally in `terraform.tfstate`. For team collaboration and safety, state should be stored remotely (like in a GCS bucket) with:

- **Locking**: Prevents two people from running Terraform simultaneously
- **Versioning**: Keeps history of state changes for recovery
- **Encryption**: Protects sensitive data in state

### Resource Dependencies

Terraform automatically understands dependencies through references:

```hcl
resource "google_service_account" "runner" {
  account_id = "budget-sync-runner"
}

resource "google_project_iam_member" "runner_role" {
  member = "serviceAccount:${google_service_account.runner.email}"
  # ↑ This reference tells Terraform to create the SA first
}
```

### Import Existing Resources

When you have resources already created in GCP (like from gcloud scripts), you need to "import" them into Terraform's state. This tells Terraform: "This resource in my config corresponds to this existing GCP resource."

```bash
terraform import google_service_account.runner \
  budget-sync-runner@budget-sync-483105.iam.gserviceaccount.com
```

After import, Terraform manages the resource - any manual changes in GCP Console will be detected and can be reverted.

### What Terraform Doesn't Do

- **Doesn't store secrets**: Secret values should be added via gcloud, not Terraform
- **Doesn't auto-rollback**: If `apply` fails halfway, you may have partial changes
- **Doesn't auto-remediate drift**: You must run `plan` to detect changes

---

## Prerequisites

Before starting, ensure you have:

- [ ] `gcloud` CLI installed and authenticated
- [ ] Project owner or editor access to `budget-sync-483105`
- [ ] Git repository cloned locally

---

## Task 1: Install Terraform

Install Terraform CLI on your machine.

**Nix (nix-darwin):**

Terraform has been added to `~/dotfiles/nix/flake.nix`. Rebuild your system:

```bash
cd ~/dotfiles/nix
darwin-rebuild switch --flake .
```

**Verify installation:**
```bash
terraform -version
# Should output: Terraform v1.x.x
```

**Expected outcome:** `terraform` command is available in terminal.

---

## Task 2: Create State Bucket

Create a GCS bucket to store Terraform state remotely.

**Run these commands:**
```bash
# Set project
gcloud config set project budget-sync-483105

# Create bucket (name must be globally unique)
gsutil mb -l europe-central2 -b on gs://budget-sync-terraform-state

# Enable versioning for disaster recovery
gsutil versioning set on gs://budget-sync-terraform-state

# Verify bucket exists
gsutil ls gs://budget-sync-terraform-state
```

**Where is the bucket name saved?**

The bucket name is configured in `terraform/provider.tf`:

```hcl
backend "gcs" {
  bucket = "budget-sync-terraform-state"  # ← here
  prefix = "terraform/state"
}
```

This is the only place it needs to be defined. Terraform reads it during `terraform init`.

**Expected outcome:** Bucket `gs://budget-sync-terraform-state` exists with versioning enabled.

---

## Task 3: Create Terraform Directory Structure

Create the directory structure for Terraform configuration files.

**Create directories and files:**
```bash
mkdir -p terraform
touch terraform/provider.tf
touch terraform/variables.tf
touch terraform/main.tf
touch terraform/outputs.tf
touch terraform/imports.tf
touch terraform/.gitignore
```

**Add to `terraform/.gitignore`:**
```gitignore
# Local .terraform directories
**/.terraform/*

# .tfstate files
*.tfstate
*.tfstate.*

# Crash log files
crash.log
crash.*.log

# Exclude all .tfvars files, which are likely to contain sensitive data
*.tfvars
*.tfvars.json

# Override files
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# CLI configuration files
.terraformrc
terraform.rc
```

**Expected outcome:** `terraform/` directory exists with empty configuration files.

---

## Task 4: Configure Terraform Provider

Configure the Google Cloud provider and state backend.

**Write to `terraform/provider.tf`:**
```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "budget-sync-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "current" {}
```

**Expected outcome:** Provider configuration file ready for initialization.

---

## Task 5: Define Variables

Define input variables for the Terraform configuration.

**Write to `terraform/variables.tf`:**
```hcl
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "budget-sync-483105"
}

variable "region" {
  description = "GCP Region for resources"
  type        = string
  default     = "europe-central2"
}

variable "image_tag" {
  description = "Docker image tag for Cloud Run Job"
  type        = string
  default     = "latest"
}
```

**Expected outcome:** Variables file defines project configuration.

---

## Task 6: Initialize Terraform

Initialize Terraform to download providers and configure the backend.

**Run from project root:**
```bash
cd terraform
terraform init
```

**Expected output:**
```
Initializing the backend...
Successfully configured the backend "gcs"!

Initializing provider plugins...
- Finding hashicorp/google versions matching "~> 5.0"...
- Installing hashicorp/google v5.x.x...

Terraform has been successfully initialized!
```

**Expected outcome:** `.terraform/` directory created, backend configured.

---

## Task 7: Define Service Accounts

Add service account resource definitions.

**Write to `terraform/main.tf`:**
```hcl
# =============================================================================
# Service Accounts
# =============================================================================

resource "google_service_account" "runner" {
  account_id   = "budget-sync-runner"
  display_name = "Budget Sync Runner"
  description  = "Runs Cloud Run Jobs, accesses Sheets API and secrets"
  project      = var.project_id
}

resource "google_service_account" "scheduler" {
  account_id   = "budget-sync-scheduler"
  display_name = "Budget Sync Scheduler"
  description  = "Triggers Cloud Run Jobs on schedule"
  project      = var.project_id
}

resource "google_service_account" "deployer" {
  account_id   = "budget-sync-deployer"
  display_name = "Budget Sync Deployer"
  description  = "GitHub Actions deployment service account"
  project      = var.project_id
}
```

**Expected outcome:** Three service account resources defined in configuration.

---

## Task 8: Import Existing Service Accounts

Import the existing service accounts from GCP into Terraform state.

**Write to `terraform/imports.tf`:**
```hcl
# =============================================================================
# Import Blocks for Existing Resources
# =============================================================================
# These import blocks tell Terraform which existing GCP resources correspond
# to the resource blocks in our configuration. Run `terraform plan` to see
# the import actions, then `terraform apply` to execute them.

import {
  id = "projects/budget-sync-483105/serviceAccounts/budget-sync-runner@budget-sync-483105.iam.gserviceaccount.com"
  to = google_service_account.runner
}

import {
  id = "projects/budget-sync-483105/serviceAccounts/budget-sync-scheduler@budget-sync-483105.iam.gserviceaccount.com"
  to = google_service_account.scheduler
}

import {
  id = "projects/budget-sync-483105/serviceAccounts/budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_service_account.deployer
}
```

**Run import:**
```bash
terraform plan   # Review what will be imported
terraform apply  # Execute the import
```

**Expected outcome:** Service accounts imported into Terraform state. Running `terraform plan` should show no changes needed.

---

## Task 9: Define IAM Role Bindings

Add IAM role bindings for service accounts.

**Append to `terraform/main.tf`:**
```hcl
# =============================================================================
# IAM Role Bindings
# =============================================================================

# Runner: Access to secrets
resource "google_project_iam_member" "runner_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.runner.email}"
}

# Scheduler: Invoke Cloud Run
resource "google_project_iam_member" "scheduler_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.scheduler.email}"
}

# Deployer: Manage Cloud Run
resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer: Push to Artifact Registry
resource "google_project_iam_member" "deployer_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer: Use service accounts
resource "google_project_iam_member" "deployer_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
```

**Expected outcome:** Five IAM binding resources defined.

---

## Task 10: Import Existing IAM Bindings

Import existing IAM bindings into Terraform state.

**Append to `terraform/imports.tf`:**
```hcl
# IAM Bindings
import {
  id = "budget-sync-483105 roles/secretmanager.secretAccessor serviceAccount:budget-sync-runner@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.runner_secret_accessor
}

import {
  id = "budget-sync-483105 roles/run.invoker serviceAccount:budget-sync-scheduler@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.scheduler_run_invoker
}

import {
  id = "budget-sync-483105 roles/run.admin serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_run_admin
}

import {
  id = "budget-sync-483105 roles/artifactregistry.writer serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_artifact_writer
}

import {
  id = "budget-sync-483105 roles/iam.serviceAccountUser serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_sa_user
}
```

**Run import:**
```bash
terraform plan
terraform apply
```

**Expected outcome:** IAM bindings imported. `terraform plan` shows no changes.

---

## Task 11: Define Artifact Registry

Add Artifact Registry repository resource.

**Append to `terraform/main.tf`:**
```hcl
# =============================================================================
# Artifact Registry
# =============================================================================

resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "budget-sync"
  description   = "Budget Sync Docker images"
  format        = "DOCKER"
  project       = var.project_id

  docker_config {
    immutable_tags = false
  }
}
```

**Expected outcome:** Artifact Registry resource defined.

---

## Task 12: Import Existing Artifact Registry

Import the existing Artifact Registry repository.

**Append to `terraform/imports.tf`:**
```hcl
# Artifact Registry
import {
  id = "projects/budget-sync-483105/locations/europe-central2/repositories/budget-sync"
  to = google_artifact_registry_repository.docker
}
```

**Run import:**
```bash
terraform plan
terraform apply
```

**Expected outcome:** Artifact Registry imported. `terraform plan` shows no changes.

---

## Task 13: Define Secret Manager Secrets

Add Secret Manager secret resources (metadata only, not values).

**Append to `terraform/main.tf`:**
```hcl
# =============================================================================
# Secret Manager
# =============================================================================

resource "google_secret_manager_secret" "monobank_token" {
  secret_id = "monobank-token"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    app = "budget-sync"
  }
}

resource "google_secret_manager_secret" "spreadsheet_id" {
  secret_id = "spreadsheet-id"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    app = "budget-sync"
  }
}
```

**Expected outcome:** Two secret resources defined (values managed separately).

---

## Task 14: Import Existing Secrets

Import existing secrets into Terraform state.

**Append to `terraform/imports.tf`:**
```hcl
# Secrets
import {
  id = "projects/budget-sync-483105/secrets/monobank-token"
  to = google_secret_manager_secret.monobank_token
}

import {
  id = "projects/budget-sync-483105/secrets/spreadsheet-id"
  to = google_secret_manager_secret.spreadsheet_id
}
```

**Run import:**
```bash
terraform plan
terraform apply
```

**Expected outcome:** Secrets imported. `terraform plan` shows no changes.

---

## Task 15: Define Cloud Run Job

Add Cloud Run Job resource.

**Append to `terraform/main.tf`:**
```hcl
# =============================================================================
# Cloud Run Job
# =============================================================================

resource "google_cloud_run_v2_job" "sync_transactions" {
  name                = "sync-transactions"
  location            = var.region
  project             = var.project_id
  deletion_protection = false

  template {
    template {
      timeout         = "900s" # 15 minutes
      max_retries     = 1
      service_account = google_service_account.runner.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/sync-monobank:${var.image_tag}"

        env {
          name = "MONOBANK_TOKEN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.monobank_token.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "SPREADSHEET_ID"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.spreadsheet_id.secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_iam_member.runner_secret_accessor
  ]

  lifecycle {
    ignore_changes = [
      # Image tag is managed by CI/CD, not Terraform
      template[0].template[0].containers[0].image
    ]
  }
}
```

**Note:** The `lifecycle.ignore_changes` block tells Terraform to ignore changes to the image tag. This allows GitHub Actions to update the image without Terraform reverting it.

**Expected outcome:** Cloud Run Job resource defined.

---

## Task 16: Import Existing Cloud Run Job

Import the existing Cloud Run Job.

**Append to `terraform/imports.tf`:**
```hcl
# Cloud Run Job
import {
  id = "projects/budget-sync-483105/locations/europe-central2/jobs/sync-transactions"
  to = google_cloud_run_v2_job.sync_transactions
}
```

**Run import:**
```bash
terraform plan
terraform apply
```

**Note:** The plan may show some differences due to configuration drift. Review changes carefully before applying.

**Expected outcome:** Cloud Run Job imported into state.

---

## Task 17: Define Cloud Scheduler

Add Cloud Scheduler job resource.

**Append to `terraform/main.tf`:**
```hcl
# =============================================================================
# Cloud Scheduler
# =============================================================================

resource "google_cloud_scheduler_job" "sync_transactions" {
  name             = "sync-transactions-scheduler"
  description      = "Trigger sync-transactions job every 3 hours"
  schedule         = "0 */3 * * *"
  time_zone        = "Etc/UTC"
  region           = var.region
  project          = var.project_id
  attempt_deadline = "1800s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "5s"
    max_backoff_duration = "3600s"
    max_doublings        = 5
  }

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${data.google_project.current.number}/jobs/${google_cloud_run_v2_job.sync_transactions.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [
    google_cloud_run_v2_job.sync_transactions,
    google_project_iam_member.scheduler_run_invoker
  ]
}
```

**Expected outcome:** Cloud Scheduler resource defined.

---

## Task 18: Import Existing Cloud Scheduler

Import the existing Cloud Scheduler job.

**Append to `terraform/imports.tf`:**
```hcl
# Cloud Scheduler
import {
  id = "projects/budget-sync-483105/locations/europe-central2/jobs/sync-transactions-scheduler"
  to = google_cloud_scheduler_job.sync_transactions
}
```

**Run import:**
```bash
terraform plan
terraform apply
```

**Expected outcome:** Cloud Scheduler imported. `terraform plan` shows no changes.

---

## Task 19: Define Outputs

Add output values for reference.

**Write to `terraform/outputs.tf`:**
```hcl
output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

output "cloud_run_job_name" {
  description = "Name of the Cloud Run Job"
  value       = google_cloud_run_v2_job.sync_transactions.name
}

output "scheduler_job_name" {
  description = "Name of the Cloud Scheduler Job"
  value       = google_cloud_scheduler_job.sync_transactions.name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "runner_service_account" {
  description = "Email of the runner service account"
  value       = google_service_account.runner.email
}

output "deployer_service_account" {
  description = "Email of the deployer service account"
  value       = google_service_account.deployer.email
}
```

**Expected outcome:** Outputs defined for easy reference.

---

## Task 20: Verify Complete Configuration

Run a final plan to verify all resources are properly imported and configured.

```bash
terraform plan
```

**Expected output:**
```
No changes. Your infrastructure matches the configuration.
```

If there are changes shown, review them carefully:
- **Expected changes:** Image tag differences (ignored via lifecycle)
- **Unexpected changes:** May indicate drift that needs investigation

**Expected outcome:** Terraform configuration matches GCP infrastructure.

---

## Task 21: Clean Up Import Blocks

After successful import, import blocks can be removed or commented out.

**Update `terraform/imports.tf`:**
```hcl
# =============================================================================
# Import Blocks - COMPLETED
# =============================================================================
# All resources have been imported. These blocks are kept for documentation
# but can be removed if desired. They are idempotent and will not cause
# issues if left in place.
#
# To re-import a resource (e.g., after deleting from state):
# terraform import <resource_address> <resource_id>
#
# Example:
# terraform import google_service_account.runner \
#   budget-sync-runner@budget-sync-483105.iam.gserviceaccount.com

# ... keep or remove import blocks as desired ...
```

**Expected outcome:** Import blocks documented or removed.

---

## Task 22: Update GitHub Actions Workflows

Split CI/CD into separate workflow files for better organization and maintenance.

### 22.1: Create CI workflow

**Create `.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run check

      - name: Unit tests
        run: bun test tests/unit
```

### 22.2: Create Terraform workflow

**Create `.github/workflows/terraform.yml`:**
```yaml
name: Terraform

on:
  push:
    branches: [main]
    paths:
      - 'terraform/**'
  pull_request:
    branches: [main]
    paths:
      - 'terraform/**'

env:
  TF_WORKING_DIR: terraform

jobs:
  validate:
    name: Validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Terraform Init
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform init -backend=false

      - name: Terraform Format Check
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform fmt -check -recursive

      - name: Terraform Validate
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform validate

  plan:
    name: Plan
    runs-on: ubuntu-latest
    needs: validate
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Terraform Init
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform init

      - name: Terraform Plan
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform plan -no-color -out=tfplan

      - name: Upload Plan
        uses: actions/upload-artifact@v4
        with:
          name: tfplan
          path: ${{ env.TF_WORKING_DIR }}/tfplan
          retention-days: 5

  apply:
    name: Apply
    runs-on: ubuntu-latest
    needs: plan
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Terraform Init
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform init

      - name: Download Plan
        uses: actions/download-artifact@v4
        with:
          name: tfplan
          path: ${{ env.TF_WORKING_DIR }}

      - name: Terraform Apply
        working-directory: ${{ env.TF_WORKING_DIR }}
        run: terraform apply -auto-approve tfplan
```

### 22.3: Update Deploy workflow

**Replace `.github/workflows/deploy.yml` with:**
```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'package.json'
      - 'bun.lock'
      - 'docker/**'
      - 'tsconfig.json'
  workflow_dispatch:

env:
  PROJECT_ID: budget-sync-483105
  REGION: europe-central2
  REPOSITORY: budget-sync
  IMAGE_NAME: sync-monobank

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.image_tag }}
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev --quiet

      - name: Set image tag
        id: meta
        run: |
          IMAGE_TAG="${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}"
          echo "image_tag=$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Build and push
        run: |
          docker build -f docker/Dockerfile.sync-monobank -t ${{ steps.meta.outputs.image_tag }} .
          docker push ${{ steps.meta.outputs.image_tag }}

  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Setup gcloud
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Run
        run: |
          gcloud run jobs deploy sync-transactions \
            --image=${{ needs.build.outputs.image_tag }} \
            --region=${{ env.REGION }} \
            --project=${{ env.PROJECT_ID }}

      - name: Deployment Summary
        run: |
          echo "## Deployment Complete" >> $GITHUB_STEP_SUMMARY
          echo "- **Image:** ${{ needs.build.outputs.image_tag }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Job:** sync-transactions" >> $GITHUB_STEP_SUMMARY
          echo "- **Region:** ${{ env.REGION }}" >> $GITHUB_STEP_SUMMARY
```

### How it works

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | Every push/PR | Tests, lint, typecheck |
| `terraform.yml` | `terraform/**` changes | Validate → Plan → Apply |
| `deploy.yml` | App code changes | Build → Deploy |

**Path-based triggers** (`paths:`) ensure workflows only run when relevant files change:
- Change `src/main.ts` → CI + Deploy run, Terraform skips
- Change `terraform/main.tf` → CI + Terraform run, Deploy skips
- Change both → All three run

### Terraform CI checks

The terraform workflow includes:
1. **Format check** (`terraform fmt -check`) - fails if files aren't formatted
2. **Validate** (`terraform validate`) - checks syntax and configuration
3. **Plan** - shows what would change
4. **Apply** - applies on merge to main

Pre-commit handles formatting locally (via lint-staged), CI catches anything missed.

**Expected outcome:** Three separate workflow files with path-based triggers.

---

## Task 23: Update justfile

Add Terraform commands to the task runner for local development and debugging. These commands are **not for production changes** - all production changes go through CI/CD.

**Append to `justfile`:**
```just
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
```

**Note:** There is intentionally no `tf-apply` command. All applies go through CI/CD to ensure:
- Changes are code-reviewed via PR
- State locking prevents conflicts
- Audit trail in GitHub Actions

**Expected outcome:** Terraform commands available via `just tf-*` for local development.

---

## Task 24: Update Documentation

Update CLAUDE.md to reflect the automated Terraform workflow.

**Add section to `CLAUDE.md`:**
```markdown
## Infrastructure Management

Infrastructure is managed with Terraform via CI/CD. Configuration files are in `terraform/`.

### How Changes Are Applied

All changes are applied automatically through GitHub Actions:

| You do | CI/CD does |
|--------|-----------|
| Edit `terraform/*.tf` | Terraform plan (PR) → apply (merge) |
| Edit `src/**` | Build → Deploy |
| Edit both | Terraform apply → Build → Deploy |

**There are no manual apply steps.** Push your changes and CI/CD handles the rest.

### What Terraform Manages

- Service accounts and IAM bindings
- Artifact Registry repository
- Secret Manager secrets (metadata only)
- Cloud Run Job configuration
- Cloud Scheduler job

### What Terraform Does NOT Manage

- Docker image tags (updated by gcloud CLI in CI/CD)
- Secret values (add via `gcloud secrets versions add`)
- API enablement (one-time setup)

### Making Infrastructure Changes

1. Edit `.tf` files in `terraform/`
2. Run `just tf-plan` locally to preview (optional)
3. Run `just tf-fmt` to format files
4. Create PR - CI shows terraform plan
5. Merge PR - CI applies changes automatically

### Local Development Commands

```bash
just tf-init      # Initialize (required once)
just tf-plan      # Preview changes (read-only)
just tf-fmt       # Format before commit
just tf-validate  # Check syntax
just tf-state     # List managed resources
```


**Expected outcome:** Documentation updated with automated workflow instructions.

---

## Task 25: Verify End-to-End Flow

Test the complete deployment flow to ensure everything works together.

**Test 1: Verify Terraform state locally**
```bash
cd terraform
terraform init
terraform plan
# Should show "No changes"
```

**Test 2: Test infrastructure change flow**
```bash
# Make a trivial change to terraform (e.g., add a comment)
echo "# Test comment" >> terraform/main.tf

# Create a branch and PR
git checkout -b test/terraform-ci
git add terraform/main.tf
git commit -m "test: verify terraform CI/CD"
git push -u origin test/terraform-ci

# Open PR in GitHub
# → CI should run terraform plan and show the comment change

# Close PR without merging (it's just a test)
git checkout main
git branch -D test/terraform-ci
```

**Test 3: Test application deploy flow**
```bash
# Make a trivial change to app code
echo "// test" >> src/main.ts

# Push to main (or create PR first)
git add src/main.ts
git commit -m "test: verify app deploy CI/CD"
git push

# → CI should build and deploy
# → Check GitHub Actions for success

# Revert the test change
git revert HEAD
git push
```

**Test 4: Verify job still runs**
```bash
just gcp-run
# Should execute successfully
```

**Expected outcome:** All CI/CD flows work correctly - infrastructure and app changes are applied automatically.

---

## Troubleshooting

### "Resource already exists" error during import

The resource is already in state. Check with:
```bash
terraform state list | grep <resource_name>
```

### "No changes" but GCP shows different config

Terraform may be ignoring certain attributes. Check `lifecycle.ignore_changes` blocks.

### State lock errors

Someone else may be running Terraform, or a previous run crashed. To force unlock:
```bash
terraform force-unlock <lock_id>
```

### Import fails with "not found"

Verify the resource exists in GCP:
```bash
gcloud run jobs describe sync-transactions --region=europe-central2
```

### Drift detected after manual changes

If someone changed resources via Console, run:
```bash
terraform plan  # See what changed
terraform apply # Revert to Terraform config
# OR update .tf files to match desired state
```

---

## Reference: Complete File Structure

After completing all tasks:

```
terraform/
├── .gitignore          # Ignore local state and credentials
├── provider.tf         # Provider and backend configuration
├── variables.tf        # Input variables
├── main.tf             # Resource definitions
├── outputs.tf          # Output values
└── imports.tf          # Import blocks (can be removed after import)
```

---

## Reference: Import Command Cheatsheet

```bash
# Service Account
terraform import google_service_account.NAME \
  EMAIL_ADDRESS

# IAM Member
terraform import google_project_iam_member.NAME \
  "PROJECT_ID ROLE MEMBER"

# Artifact Registry
terraform import google_artifact_registry_repository.NAME \
  projects/PROJECT/locations/REGION/repositories/REPO_ID

# Secret Manager
terraform import google_secret_manager_secret.NAME \
  projects/PROJECT/secrets/SECRET_ID

# Cloud Run Job
terraform import google_cloud_run_v2_job.NAME \
  projects/PROJECT/locations/REGION/jobs/JOB_NAME

# Cloud Scheduler
terraform import google_cloud_scheduler_job.NAME \
  projects/PROJECT/locations/REGION/jobs/JOB_NAME
```
