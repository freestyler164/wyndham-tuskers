resource "random_id" "cognito_sms_external_id" {
  byte_length = 16
}

data "aws_iam_policy_document" "cognito_sms_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["cognito-idp.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [random_id.cognito_sms_external_id.hex]
    }
  }
}

resource "aws_iam_role" "cognito_sms" {
  name               = "${local.name_prefix}-cognito-sms"
  assume_role_policy = data.aws_iam_policy_document.cognito_sms_assume_role.json
}

data "aws_iam_policy_document" "cognito_sms" {
  statement {
    actions   = ["sns:Publish"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "cognito_sms" {
  name   = "${local.name_prefix}-cognito-sms"
  role   = aws_iam_role.cognito_sms.id
  policy = data.aws_iam_policy_document.cognito_sms.json
}

resource "aws_cognito_user_pool" "auth" {
  name           = "${local.name_prefix}-auth"
  user_pool_tier = "ESSENTIALS"

  username_attributes      = ["phone_number"]
  auto_verified_attributes = ["phone_number"]

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD", "SMS_OTP"]
  }

  sms_configuration {
    external_id    = random_id.cognito_sms_external_id.hex
    sns_caller_arn = aws_iam_role.cognito_sms.arn
    sns_region     = var.aws_region
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  depends_on = [aws_iam_role_policy.cognito_sms]
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name_prefix}-web"
  user_pool_id = aws_cognito_user_pool.auth.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"
  explicit_auth_flows           = ["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 180

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user" "admin" {
  user_pool_id   = aws_cognito_user_pool.auth.id
  username       = var.admin_user_phone
  message_action = "SUPPRESS"

  attributes = {
    phone_number          = var.admin_user_phone
    phone_number_verified = "true"
    name                  = var.admin_user_display_name
  }
}
