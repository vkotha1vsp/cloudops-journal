resource "aws_cognito_user_pool" "this" {
  name                     = local.name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  mfa_configuration        = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # Single-admin app: no self sign-up. Users are created by Terraform (below) or an admin.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 3
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "random_id" "cognito_domain" {
  byte_length = 3
}

# Cognito-hosted sign-in page at https://<prefix>.auth.<region>.amazoncognito.com
resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.project}-${random_id.cognito_domain.hex}"
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "app" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = ["${local.app_url}/api/auth/callback/cognito"]
  logout_urls                          = ["${local.app_url}/login"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 7
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

# Creates your user and emails you a temporary password.
resource "aws_cognito_user" "admin" {
  user_pool_id = aws_cognito_user_pool.this.id
  username     = var.admin_email
  attributes = {
    email          = var.admin_email
    email_verified = "true"
  }
  desired_delivery_mediums = ["EMAIL"]
  lifecycle {
    ignore_changes = [attributes]
  }
}
