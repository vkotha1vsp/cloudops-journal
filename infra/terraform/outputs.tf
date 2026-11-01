output "app_url" {
  value = local.app_url
}

output "aws_region" {
  value = var.aws_region
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "app_task_family" {
  value = aws_ecs_task_definition.app.family
}

output "migrate_task_family" {
  value = aws_ecs_task_definition.migrate.family
}

output "task_subnets" {
  value = join(",", local.task_subnets)
}

output "app_security_group" {
  value = aws_security_group.app.id
}

output "assign_public_ip" {
  value = local.tasks_in_public ? "ENABLED" : "DISABLED"
}

output "github_deploy_role_arn" {
  value = var.github_repository != "" ? aws_iam_role.github_deploy[0].arn : ""
}

output "cognito_hosted_ui" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "attachments_bucket" {
  value = aws_s3_bucket.attachments.bucket
}

output "db_endpoint" {
  value     = aws_db_instance.this.address
  sensitive = true
}

output "github_actions_variables" {
  description = "Paste these into GitHub → Settings → Secrets and variables → Actions → Variables."
  value = {
    AWS_REGION          = var.aws_region
    AWS_DEPLOY_ROLE_ARN = var.github_repository != "" ? aws_iam_role.github_deploy[0].arn : "(set github_repository)"
    ECR_REPOSITORY      = aws_ecr_repository.app.name
    ECS_CLUSTER         = aws_ecs_cluster.this.name
    ECS_SERVICE         = aws_ecs_service.app.name
    APP_TASK_FAMILY     = aws_ecs_task_definition.app.family
    MIGRATE_TASK_FAMILY = aws_ecs_task_definition.migrate.family
    TASK_SUBNETS        = join(",", local.task_subnets)
    TASK_SECURITY_GROUP = aws_security_group.app.id
    ASSIGN_PUBLIC_IP    = local.tasks_in_public ? "ENABLED" : "DISABLED"
    APP_URL             = local.app_url
  }
}
