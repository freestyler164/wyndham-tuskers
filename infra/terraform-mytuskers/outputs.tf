output "app_url" {
  description = "URL for the MyTuskers PWA."
  value       = local.use_custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.app.id
}

output "api_gateway_url" {
  description = "Direct HTTP API Gateway URL."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "core_table_name" {
  description = "MyTuskers core DynamoDB table."
  value       = aws_dynamodb_table.core.name
}

output "finance_table_name" {
  description = "MyTuskers finance DynamoDB table."
  value       = aws_dynamodb_table.finance.name
}

output "audit_table_name" {
  description = "MyTuskers audit DynamoDB table."
  value       = aws_dynamodb_table.audit.name
}

output "receipts_bucket_name" {
  description = "Private S3 bucket for receipt assets."
  value       = aws_s3_bucket.receipts.bucket
}

output "cognito_user_pool_id" {
  description = "Legacy Cognito user pool retained in state but not used by password auth."
  value       = aws_cognito_user_pool.auth.id
}

output "cognito_web_client_id" {
  description = "Legacy Cognito app client retained in state but not used by password auth."
  value       = aws_cognito_user_pool_client.web.id
}
