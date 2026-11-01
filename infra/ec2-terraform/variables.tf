variable "project" {
  type    = string
  default = "cloudops-journal"
}

variable "environment" {
  type    = string
  default = "ec2"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "hosted_zone_name" {
  description = "Existing public Route 53 hosted zone you own, e.g. example.com."
  type        = string
}

variable "app_subdomain" {
  description = "App hostname inside the zone: \"learn\" → learn.example.com."
  type        = string
  default     = "learn"
}

variable "admin_email" {
  description = "Your email: the only allowed sign-in. Cognito emails a temporary password here."
  type        = string
}

variable "github_repository" {
  description = "owner/name of the repo allowed to deploy (GitHub OIDC)."
  type        = string
  default     = "vkotha1vsp/cloudops-journal"
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "create_github_oidc_provider" {
  description = "Set false if this AWS account already has the token.actions.githubusercontent.com provider."
  type        = bool
  default     = true
}

variable "instance_type" {
  description = "t3.small (2 GiB) runs app + Postgres with swap; use t3.medium for more headroom."
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  type    = number
  default = 30
}

variable "vpc_cidr" {
  type    = string
  default = "10.50.0.0/16"
}

variable "alarm_email" {
  type    = string
  default = ""
}

variable "backup_retention_days" {
  type    = number
  default = 30
}

variable "deletion_protection" {
  description = "Protects the ALB, Cognito pool and data buckets. Set false before `terraform destroy`."
  type        = bool
  default     = true
}

variable "compose_version" {
  type    = string
  default = "v2.32.4"
}
