variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "cloudops-journal"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "hosted_zone_name" {
  description = "Existing Route 53 public hosted zone you already own, e.g. example.com. Nothing is transferred."
  type        = string
}

variable "app_subdomain" {
  description = "Subdomain for the app inside the hosted zone, e.g. \"learn\" → learn.example.com."
  type        = string
  default     = "learn"
}

variable "admin_email" {
  description = "Your email. Created as the only Cognito user and the only allowed sign-in."
  type        = string
}

variable "github_repository" {
  description = "GitHub repo allowed to deploy via OIDC, as owner/name (e.g. vivek/cloudops-journal). Empty disables the deploy role."
  type        = string
  default     = ""
}

variable "github_branch" {
  description = "Branch allowed to assume the deploy role."
  type        = string
  default     = "main"
}

variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub OIDC provider. Set false if your account already has one."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "nat_gateway" {
  description = <<-EOT
    Outbound internet for the app tasks (Cognito token exchange, later Bedrock):
      "single" – one NAT gateway in private subnets (recommended, ~USD 33/month + data)
      "none"   – run tasks in public subnets with public IPs; inbound still allowed only from the ALB (cheapest)
  EOT
  type        = string
  default     = "single"
  validation {
    condition     = contains(["single", "none"], var.nat_gateway)
    error_message = "nat_gateway must be \"single\" or \"none\"."
  }
}

variable "container_image_tag" {
  description = "Image tag to run. CI overrides the running task definition on every deploy; this sets the initial one."
  type        = string
  default     = "bootstrap"
}

variable "task_cpu" {
  type    = number
  default = 512
}

variable "task_memory" {
  type    = number
  default = 1024
}

variable "desired_count" {
  description = "Number of app tasks. The in-memory rate limiter assumes 1; see README before raising."
  type        = number
  default     = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_multi_az" {
  description = "Standby replica in a second AZ (doubles database cost)."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  description = "Protect the database and load balancer from accidental deletion. Set false before `terraform destroy`."
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = "Email for CloudWatch alarm notifications (confirm the subscription email). Empty to skip."
  type        = string
  default     = ""
}

variable "max_upload_mb" {
  type    = number
  default = 25
}

variable "log_retention_days" {
  type    = number
  default = 30
}
