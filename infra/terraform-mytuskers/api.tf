resource "random_password" "jwt_secret" {
  length  = 48
  special = true
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.api_lambda.arn
  runtime          = "nodejs22.x"
  handler          = "src/lambda.handler"
  filename         = local.lambda_zip_path
  source_code_hash = filebase64sha256(local.lambda_zip_path)
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout_seconds

  environment {
    variables = {
      NODE_ENV                            = "production"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      MYTUSKERS_CORE_TABLE                = aws_dynamodb_table.core.name
      MYTUSKERS_FINANCE_TABLE             = aws_dynamodb_table.finance.name
      MYTUSKERS_AUDIT_TABLE               = aws_dynamodb_table.audit.name
      MYTUSKERS_RECEIPTS_BUCKET           = aws_s3_bucket.receipts.bucket
      MYTUSKERS_JWT_SECRET                = random_password.jwt_secret.result
      MYTUSKERS_RESEND_API_KEY            = var.resend_api_key
      MYTUSKERS_EMAIL_FROM                = var.email_from
      MYTUSKERS_VAPID_PUBLIC_KEY          = var.vapid_public_key
      MYTUSKERS_VAPID_PRIVATE_KEY         = var.vapid_private_key
      MYTUSKERS_VAPID_SUBJECT             = var.vapid_subject
      MYTUSKERS_WEB_ORIGIN                = local.web_origin
      MYTUSKERS_SEED_ON_STARTUP           = tostring(var.seed_on_startup)
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy_attachment.api_lambda_basic,
    aws_iam_role_policy.api_lambda,
  ]
}

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "v1_proxy" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /v1/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
