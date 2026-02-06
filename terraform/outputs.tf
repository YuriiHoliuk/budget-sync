output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

output "cloud_run_job_name" {
  description = "Name of the sync-accounts Cloud Run Job"
  value       = google_cloud_run_v2_job.sync_accounts.name
}

output "scheduler_job_name" {
  description = "Name of the sync-accounts Cloud Scheduler Job"
  value       = google_cloud_scheduler_job.sync_accounts.name
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

output "webhook_url" {
  description = "Cloud Run Service URL for Monobank webhook registration"
  value       = google_cloud_run_v2_service.webhook.uri
}

output "pubsub_topic" {
  description = "Pub/Sub topic for webhook messages"
  value       = google_pubsub_topic.webhook_transactions.name
}

output "pubsub_subscription" {
  description = "Pub/Sub subscription for webhook messages"
  value       = google_pubsub_subscription.webhook_transactions.name
}

output "web_url" {
  description = "Cloud Run Service URL for the web application"
  value       = google_cloud_run_v2_service.web.uri
}
