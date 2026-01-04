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
