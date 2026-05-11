output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  value = var.aws_region
}

output "app_url" {
  value = local.app_url
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.backend.api_endpoint
}

output "lambda_function_name" {
  value = aws_lambda_function.backend.function_name
}

output "dynamodb_tables" {
  value = local.table_names
}

output "jwt_secret_id" {
  value = aws_secretsmanager_secret.jwt_secret.id
}

output "resend_api_key_secret_id" {
  value = aws_secretsmanager_secret.resend_api_key.id
}
