resource "random_password" "jwt_secret" {
  count   = var.jwt_secret == "" ? 1 : 0
  length  = 48
  special = true
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name_prefix}/jwt-secret"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret[0].result
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name                    = "${local.name_prefix}/resend-api-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "resend_api_key" {
  secret_id     = aws_secretsmanager_secret.resend_api_key.id
  secret_string = var.resend_api_key != "" ? var.resend_api_key : "replace-me-in-secrets-manager"

  lifecycle {
    ignore_changes = [secret_string]
  }
}
