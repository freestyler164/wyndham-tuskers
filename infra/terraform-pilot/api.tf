resource "aws_cloudwatch_log_group" "backend" {
  name              = "/aws/lambda/${local.name_prefix}-backend"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "backend" {
  function_name    = "${local.name_prefix}-backend"
  role             = aws_iam_role.backend_lambda.arn
  runtime          = "nodejs22.x"
  handler          = "src/lambda.handler"
  filename         = local.lambda_zip_path
  source_code_hash = filebase64sha256(local.lambda_zip_path)
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout_seconds

  environment {
    variables = {
      NODE_ENV                    = "production"
      USERS_TABLE                 = aws_dynamodb_table.members.name
      TOKENS_TABLE                = aws_dynamodb_table.tokens.name
      SURVEYS_TABLE               = aws_dynamodb_table.surveys.name
      RESPONSES_TABLE             = aws_dynamodb_table.responses.name
      EVENTS_TABLE                = aws_dynamodb_table.events.name
      FRONTEND_URL                = local.app_url
      CORS_ALLOWED_ORIGINS        = local.allowed_origins
      EMAIL_PROVIDER              = "resend"
      EMAIL_FROM                  = var.email_from
      JWT_SECRET_ID               = aws_secretsmanager_secret.jwt_secret.id
      RESEND_API_KEY_SECRET_ID    = aws_secretsmanager_secret.resend_api_key.id
      ENABLE_MEMBER_REGISTRATION  = tostring(var.enable_member_registration)
      PASSWORD_MIN_LENGTH         = tostring(var.password_min_length)
      AUTH_RATE_LIMIT_MAX         = tostring(var.auth_rate_limit_max)
      ENFORCE_HTTPS               = "true"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.backend,
    aws_iam_role_policy_attachment.backend_lambda_basic,
    aws_iam_role_policy.backend_lambda,
  ]
}

resource "aws_apigatewayv2_api" "backend" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "backend" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api_proxy" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.backend.id}"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.backend.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}
