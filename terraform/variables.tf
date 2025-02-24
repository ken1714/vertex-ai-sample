variable project_id {
  type    = string
}

variable region {
  type    = string
  default = "asia-northeast1"
}

variable location {
  type    = string
  default = "ASIA-NORTHEAST1"
}

variable "frontend_cloudrun_name" {
  type    = string
  default = "vertex-ai-frontend"
}

variable "backend_cloudrun_name" {
  type    = string
  default = "vertex-ai-backend"
}

variable "frontend_cloudrun_image" {
  type    = string
}

variable "backend_cloudrun_image" {
  type    = string
}

variable "host" {
  type    = string
}

variable "frontend_url" {
  type    = string
}

variable "langfuse_secret_key" {
  type    = string
}

variable "langfuse_public_key" {
  type    = string
}

variable "langfuse_host" {
  type    = string
}
