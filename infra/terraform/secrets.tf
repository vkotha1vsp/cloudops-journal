resource "random_password" "nextauth" {
  length  = 48
  special = false
}

# All app secrets in one Secrets Manager secret; ECS injects individual JSON keys as env vars.
# The values also live in Terraform state, so keep state in an encrypted, private S3 bucket.
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  description             = "CloudOps Journal runtime secrets"
  recovery_window_in_days = var.deletion_protection ? 7 : 0
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL          = "postgresql://${aws_db_instance.this.username}:${random_password.db.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?schema=public&sslmode=require"
    NEXTAUTH_SECRET       = random_password.nextauth.result
    COGNITO_CLIENT_SECRET = aws_cognito_user_pool_client.app.client_secret
  })
}
