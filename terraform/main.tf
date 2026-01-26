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

# Deployer: Manage Pub/Sub (for Terraform)
resource "google_project_iam_member" "deployer_pubsub_admin" {
  project = var.project_id
  role    = "roles/pubsub.admin"
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

import {
  to = google_secret_manager_secret.gemini_api_key
  id = "projects/budget-sync-483105/secrets/gemini-api-key"
}

resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "gemini-api-key"
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

resource "google_cloud_run_v2_job" "sync_accounts" {
  name     = "sync-accounts"
  location = var.region
  project  = var.project_id

  template {
    template {
      timeout         = "300s" # 5 minutes
      max_retries     = 1
      service_account = google_service_account.runner.email

      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/budget-sync:${var.image_tag}"
        args  = ["src/jobs/sync-accounts.ts"]

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

        env {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.gemini_api_key.secret_id
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

resource "google_cloud_scheduler_job" "sync_accounts" {
  name             = "sync-accounts-scheduler"
  description      = "Trigger sync-accounts job every 3 hours"
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
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${data.google_project.current.number}/jobs/${google_cloud_run_v2_job.sync_accounts.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [
    google_cloud_run_v2_job.sync_accounts,
    google_project_iam_member.scheduler_run_invoker
  ]
}

# =============================================================================
# Pub/Sub - Webhook Messages Queue
# =============================================================================

# Main topic for webhook transaction messages
resource "google_pubsub_topic" "webhook_transactions" {
  name    = "webhook-transactions"
  project = var.project_id

  labels = {
    app = "budget-sync"
  }
}

# Dead letter topic for failed messages
resource "google_pubsub_topic" "webhook_transactions_dlq" {
  name    = "webhook-transactions-dlq"
  project = var.project_id

  labels = {
    app = "budget-sync"
  }
}

# Main subscription with push delivery to Cloud Run
resource "google_pubsub_subscription" "webhook_transactions" {
  name    = "webhook-transactions-sub"
  topic   = google_pubsub_topic.webhook_transactions.id
  project = var.project_id

  ack_deadline_seconds = 60

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.webhook.uri}/webhook/process"

    oidc_token {
      service_account_email = google_service_account.runner.email
      audience              = google_cloud_run_v2_service.webhook.uri
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.webhook_transactions_dlq.id
    max_delivery_attempts = 5
  }

  labels = {
    app = "budget-sync"
  }

  depends_on = [
    google_pubsub_topic_iam_member.dlq_publisher,
    google_cloud_run_v2_service.webhook
  ]
}

# DLQ subscription for logging failed messages
resource "google_pubsub_subscription" "webhook_transactions_dlq" {
  name    = "webhook-transactions-dlq-sub"
  topic   = google_pubsub_topic.webhook_transactions_dlq.id
  project = var.project_id

  ack_deadline_seconds = 60

  labels = {
    app = "budget-sync"
  }
}

# =============================================================================
# Pub/Sub IAM
# =============================================================================

# Runner can publish messages to the main topic
resource "google_pubsub_topic_iam_member" "runner_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.webhook_transactions.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.runner.email}"
}

# Runner can subscribe/pull from the main subscription
resource "google_pubsub_subscription_iam_member" "runner_subscriber" {
  project      = var.project_id
  subscription = google_pubsub_subscription.webhook_transactions.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.runner.email}"
}

# Runner can subscribe/pull from the DLQ subscription
resource "google_pubsub_subscription_iam_member" "runner_dlq_subscriber" {
  project      = var.project_id
  subscription = google_pubsub_subscription.webhook_transactions_dlq.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.runner.email}"
}

# Pub/Sub service account can publish to DLQ (required for dead letter policy)
resource "google_pubsub_topic_iam_member" "dlq_publisher" {
  project = var.project_id
  topic   = google_pubsub_topic.webhook_transactions_dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# Pub/Sub service account can acknowledge messages from main subscription (required for dead letter policy)
resource "google_pubsub_subscription_iam_member" "pubsub_subscriber" {
  project      = var.project_id
  subscription = google_pubsub_subscription.webhook_transactions.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# =============================================================================
# Cloud Run Service - Webhook Endpoint
# =============================================================================

resource "google_cloud_run_v2_service" "webhook" {
  name     = "webhook"
  location = var.region
  project  = var.project_id

  template {
    service_account = google_service_account.runner.email

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}/budget-sync:${var.image_tag}"
      args  = ["src/jobs/webhook-server.ts"]

      env {
        name  = "PUBSUB_TOPIC"
        value = google_pubsub_topic.webhook_transactions.name
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

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

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
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

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 0
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds = 30
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
  }

  depends_on = [
    google_project_iam_member.runner_secret_accessor,
    google_pubsub_topic_iam_member.runner_publisher
  ]

  lifecycle {
    ignore_changes = [
      # Image tag is managed by CI/CD, not Terraform
      template[0].containers[0].image
    ]
  }
}

# Allow unauthenticated access to webhook endpoint (public)
resource "google_cloud_run_v2_service_iam_member" "webhook_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.webhook.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Allow Pub/Sub to invoke Cloud Run for push subscriptions
resource "google_cloud_run_service_iam_member" "pubsub_invoker" {
  project  = var.project_id
  location = var.region
  service  = google_cloud_run_v2_service.webhook.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}