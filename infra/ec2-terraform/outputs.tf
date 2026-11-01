output "app_url" {
  value = local.app_url
}

output "instance_id" {
  value = aws_instance.app.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "codebuild_project" {
  value = aws_codebuild_project.image.name
}

output "cognito_hosted_ui" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "github_actions_variables" {
  description = "Add each as a GitHub repository variable (Settings → Secrets and variables → Actions → Variables)."
  value = {
    AWS_REGION          = var.aws_region
    EC2_DEPLOY_ROLE_ARN = aws_iam_role.github.arn
    CODEBUILD_PROJECT   = aws_codebuild_project.image.name
    EC2_INSTANCE_ID     = aws_instance.app.id
    APP_URL             = local.app_url
  }
}

output "github_connection_arn" {
  description = "Approve this connection once in the console (it starts as PENDING)."
  value       = aws_codestarconnections_connection.github.arn
}
