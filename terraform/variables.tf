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

variable "cloudrun_name" {
  type    = string
  default = "vertex-ai"
}

variable "cloudrun_image" {
  type    = string
}

variable "host" {
  type    = string
}
