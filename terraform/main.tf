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
    account_id   = "service-account-vertex-ai"
    display_name = "Service Account for vertex-ai-sample"
}

resource "google_cloud_run_v2_service" "backend" {
  name         = var.backend_cloudrun_name
  location     = var.region
  ingress      = "INGRESS_TRAFFIC_ALL"
  launch_stage = "BETA"  # Direct VPCを使用するため必要

  template {
    containers {
      image = var.backend_cloudrun_image
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "LOCARION"
        value = var.region
      }
      env {
        // 循環参照回避
        name  = "FRONTEND_URL"
        value = var.frontend_url
      }
      ports {
        container_port = 3000
      }
    }
    service_account = google_service_account.default.email
  }
}

resource "google_cloud_run_v2_service" "frontend" {
  name         = var.frontend_cloudrun_name
  location     = var.region
  ingress      = "INGRESS_TRAFFIC_ALL"
  launch_stage = "BETA"  # Direct VPCを使用するため必要

  template {
    containers {
      image = var.frontend_cloudrun_image
      env {
        name  = "HOST"
        value = var.host
      }
      env {
        name  = "VITE_BACKEND_URL"
        value = google_cloud_run_v2_service.backend.uri
      }
      ports {
        container_port = 3000
      }
    }
    service_account = google_service_account.default.email
  }
}

resource "google_cloud_run_v2_service_iam_member" "frontend" {
    location = google_cloud_run_v2_service.frontend.location
    name     = google_cloud_run_v2_service.frontend.name
    role   = "roles/run.invoker"
    member = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "backend" {
    location = google_cloud_run_v2_service.backend.location
    name     = google_cloud_run_v2_service.backend.name
    role   = "roles/run.invoker"
    member = "allUsers"
}

resource "google_project_iam_member" "my_service_account_member" {
  project     = var.project_id
  role        = "roles/aiplatform.expressUser"
  member     = "serviceAccount:${google_service_account.default.email}"
}
