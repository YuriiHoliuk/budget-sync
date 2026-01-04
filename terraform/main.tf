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

# Deployer: Manage service accounts (for Terraform)
resource "google_project_iam_member" "deployer_sa_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountAdmin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer: Manage secrets (for Terraform)
resource "google_project_iam_member" "deployer_secret_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer: Manage Cloud Scheduler (for Terraform)
resource "google_project_iam_member" "deployer_scheduler_admin" {
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer: Manage IAM bindings (for Terraform)
resource "google_project_iam_member" "deployer_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer: Admin access to Terraform state bucket
resource "google_storage_bucket_iam_member" "deployer_state_access" {
  bucket = "budget-sync-terraform-state"
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

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

# =============================================================================
# Cloud Run Job
# =============================================================================

resource "google_cloud_run_v2_job" "sync_transactions" {
  name     = "sync-transactions"
  location = var.region
  project  = var.project_id

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