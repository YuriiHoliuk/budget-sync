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

import {
  id = "budget-sync-483105 roles/iam.serviceAccountAdmin serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_sa_admin
}

import {
  id = "budget-sync-483105 roles/secretmanager.admin serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_secret_admin
}

import {
  id = "budget-sync-483105 roles/cloudscheduler.admin serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_scheduler_admin
}

import {
  id = "budget-sync-483105 roles/resourcemanager.projectIamAdmin serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_project_iam_member.deployer_iam_admin
}

import {
  id = "budget-sync-terraform-state roles/storage.admin serviceAccount:budget-sync-deployer@budget-sync-483105.iam.gserviceaccount.com"
  to = google_storage_bucket_iam_member.deployer_state_access
}

# Artifact Registry
import {
  id = "projects/budget-sync-483105/locations/europe-central2/repositories/budget-sync"
  to = google_artifact_registry_repository.docker
}

# Secrets
import {
  id = "projects/budget-sync-483105/secrets/monobank-token"
  to = google_secret_manager_secret.monobank_token
}

import {
  id = "projects/budget-sync-483105/secrets/spreadsheet-id"
  to = google_secret_manager_secret.spreadsheet_id
}

# Cloud Run Job
import {
  id = "projects/budget-sync-483105/locations/europe-central2/jobs/sync-transactions"
  to = google_cloud_run_v2_job.sync_transactions
}

# Cloud Scheduler
import {
  id = "projects/budget-sync-483105/locations/europe-central2/jobs/sync-transactions-scheduler"
  to = google_cloud_scheduler_job.sync_transactions
}
