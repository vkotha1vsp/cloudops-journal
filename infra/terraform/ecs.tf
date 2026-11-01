resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days
}

locals {
  image_repo = aws_ecr_repository.app.repository_url

  app_environment = [
    { name = "NEXTAUTH_URL", value = local.app_url },
    { name = "ALLOWED_EMAILS", value = lower(var.admin_email) },
    { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.app.id },
    { name = "COGNITO_ISSUER", value = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "S3_ATTACHMENTS_BUCKET", value = aws_s3_bucket.attachments.bucket },
    { name = "MAX_UPLOAD_MB", value = tostring(var.max_upload_mb) },
    { name = "DATABASE_POOL_MAX", value = "10" },
  ]

  secret = aws_secretsmanager_secret.app.arn
  app_secrets = [
    { name = "DATABASE_URL", valueFrom = "${local.secret}:DATABASE_URL::" },
    { name = "NEXTAUTH_SECRET", valueFrom = "${local.secret}:NEXTAUTH_SECRET::" },
    { name = "COGNITO_CLIENT_SECRET", valueFrom = "${local.secret}:COGNITO_CLIENT_SECRET::" },
  ]

  log_config = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.app.name
      awslogs-region        = var.aws_region
      awslogs-stream-prefix = "app"
    }
  }

  task_subnets = local.tasks_in_public ? aws_subnet.public[*].id : aws_subnet.app[*].id
}

# Initial task definition. GitHub Actions registers new revisions with the new image on each
# deploy, so Terraform ignores later image changes on the service (see lifecycle below).
resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name             = "app"
    image            = "${local.image_repo}:${var.container_image_tag}"
    essential        = true
    portMappings     = [{ containerPort = 3000, protocol = "tcp" }]
    environment      = local.app_environment
    secrets          = local.app_secrets
    logConfiguration = local.log_config
    linuxParameters  = { initProcessEnabled = true, capabilities = { drop = ["ALL"] } }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

# One-off task that runs `prisma migrate deploy`. CI runs it before every deployment.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = "${local.image_repo}:migrate-${var.container_image_tag}"
    essential = true
    secrets   = [local.app_secrets[0]]
    logConfiguration = merge(local.log_config, {
      options = merge(local.log_config.options, { awslogs-stream-prefix = "migrate" })
    })
  }])
}

resource "aws_ecs_service" "app" {
  name                               = "app"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.task_subnets
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = local.tasks_in_public
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 3000
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]
}
