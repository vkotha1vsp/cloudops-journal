# ───────────── Image pipeline: S3 source → CodeBuild → ECR ─────────────
resource "aws_ecr_repository" "app" {
  name                 = local.name
  image_tag_mutability = "MUTABLE" # `latest` is moved on each build; deploys pin the commit SHA tag
  force_delete         = !var.deletion_protection
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 40 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 40 }
      action       = { type = "expire" }
    }]
  })
}

# CodeBuild reads the repo through an AWS CodeConnections GitHub connection.
# After `terraform apply`, the connection is PENDING: open Developer Tools → Settings → Connections
# in the console, select it, click "Update pending connection" and authorize the GitHub app once.
resource "aws_codestarconnections_connection" "github" {
  name          = substr("${local.name}-github", 0, 32)
  provider_type = "GitHub"
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/codebuild/${local.name}"
  retention_in_days = 30
}

resource "aws_iam_role" "codebuild" {
  name = "${local.name}-codebuild"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "codebuild" {
  name = "build"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.codebuild.arn}:*"
      },
      {
        Effect = "Allow"
        Action = [
          "codeconnections:UseConnection", "codeconnections:GetConnection", "codeconnections:GetConnectionToken",
          "codestar-connections:UseConnection", "codestar-connections:GetConnection", "codestar-connections:GetConnectionToken",
        ]
        Resource = aws_codestarconnections_connection.github.arn
      },
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage",
        ]
        Resource = aws_ecr_repository.app.arn
      },
    ]
  })
}

resource "aws_codebuild_project" "image" {
  name          = "${local.name}-image"
  description   = "Builds CloudOps Journal images (buildspec.yml) and pushes them to ECR"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 30

  source {
    type            = "GITHUB"
    location        = "https://github.com/${var.github_repository}.git"
    buildspec       = "buildspec.yml"
    git_clone_depth = 1
    auth {
      type     = "CODECONNECTIONS"
      resource = aws_codestarconnections_connection.github.arn
    }
  }
  source_version = var.github_branch

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    type                        = "LINUX_CONTAINER"
    compute_type                = "BUILD_GENERAL1_MEDIUM" # Next.js builds need more than 3 GB
    image                       = "aws/codebuild/amazonlinux-x86_64-standard:5.0"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = true # required for docker build
    environment_variable {
      name  = "ECR_REPOSITORY_URI"
      value = aws_ecr_repository.app.repository_url
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
    }
  }
}
