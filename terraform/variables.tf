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
