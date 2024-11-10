locals {
  services = toset([
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iap.googleapis.com",
    "run.googleapis.com",
    "aiplatform.googleapis.com",
  ])
}

provider "google" {
  project     = var.project_id
  region      = var.region
}

resource "google_project_service" "service" {
  for_each = local.services
  project  = var.project_id
  service  = each.value
}

resource "google_service_account" "default" {
    account_id   = "service-account-${var.cloudrun_name}"
    display_name = "Service Account for ${var.cloudrun_name}"
}

resource "google_cloud_run_v2_service" "default" {
  name         = var.cloudrun_name
  location     = var.region
  ingress      = "INGRESS_TRAFFIC_ALL"
  launch_stage = "BETA"  # Direct VPCを使用するため必要

  template {
    containers {
      image = var.cloudrun_image
      ports {
        container_port = 3000
      }
    }
    service_account = google_service_account.default.email
  }
}

resource "google_cloud_run_v2_service_iam_member" "default" {
    location = google_cloud_run_v2_service.default.location
    name     = google_cloud_run_v2_service.default.name
    role   = "roles/run.invoker"
    member = "allUsers"
}
