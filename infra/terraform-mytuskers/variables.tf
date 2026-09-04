variable "aws_region" {
  type        = string
  description = "AWS region for the MyTuskers API, DynamoDB, and S3 resources."
  default     = "ap-southeast-2"
}

variable "environment" {
  type        = string
  description = "Deployment environment name."
  default     = "prod"
}

variable "project_name" {
  type        = string
  description = "Name prefix for MyTuskers resources."
  default     = "mytuskers"
}

variable "domain_name" {
  type        = string
  description = "Primary hostname for the MyTuskers PWA. Leave empty to use the CloudFront domain only."
  default     = ""
}

variable "additional_domain_names" {
  type        = list(string)
  description = "Additional hostnames for the MyTuskers PWA."
  default     = []
}

variable "cloudfront_certificate_arn" {
  type        = string
  description = "Existing us-east-1 ACM certificate ARN for CloudFront. The certificate must cover domain_name and any additional_domain_names."
  default     = ""
}

variable "hosted_zone_name" {
  type        = string
  description = "Route53 hosted zone name used for DNS validation and records. Required when domain_name is set."
  default     = ""
}

variable "create_dns_records" {
  type        = bool
  description = "Whether Terraform should create Route53 validation and app alias records."
  default     = false
}

variable "frontend_dist_dir" {
  type        = string
  description = "Path to the built apps/mytuskers-web dist directory."
  default     = "../../apps/mytuskers-web/dist"
}

variable "lambda_zip_path" {
  type        = string
  description = "Path to the zipped MyTuskers API Lambda package."
  default     = "../../build/mytuskers-api-lambda.zip"
}

variable "lambda_memory_size" {
  type        = number
  description = "Memory for the MyTuskers API Lambda."
  default     = 512
}

variable "lambda_timeout_seconds" {
  type        = number
  description = "Timeout for the MyTuskers API Lambda."
  default     = 15
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention for the MyTuskers API Lambda."
  default     = 14
}

variable "cloudfront_price_class" {
  type        = string
  description = "CloudFront price class."
  default     = "PriceClass_100"
}

variable "seed_on_startup" {
  type        = bool
  description = "Seed development data on Lambda cold start. Keep false for production."
  default     = false
}

variable "admin_user_phone" {
  type        = string
  description = "Mobile number for the initial MyTuskers global admin user."
  default     = "+61473623614"
}

variable "admin_user_email" {
  type        = string
  description = "Email address for the initial MyTuskers global admin user."
  default     = "admin@wyndhamtuskers.com"
}

variable "admin_user_display_name" {
  type        = string
  description = "Display name for the initial MyTuskers global admin user."
  default     = "Global Admin"
}

variable "admin_user_password_hash" {
  type        = string
  description = "Bcrypt password hash for the initial MyTuskers global admin user."
  sensitive   = true
  default     = "$2b$12$arQ8B7QxQZ5IQdtLcBRkU.6X.Z/kRAOdOMP.cZWi.iw8OzxDSGnkC"
}

variable "resend_api_key" {
  type        = string
  description = "Resend API key used to send email verification and password reset links."
  sensitive   = true
  default     = ""
}

variable "email_from" {
  type        = string
  description = "Verified Resend sender used for MyTuskers account emails."
  default     = "MyTuskers <noreply@wyndhamtuskers.com>"
}

variable "vapid_public_key" {
  type        = string
  description = "Public VAPID key for browser push subscriptions."
  default     = ""
}

variable "vapid_private_key" {
  type        = string
  description = "Private VAPID key used by the API to send web push notifications."
  sensitive   = true
  default     = ""
}

variable "vapid_subject" {
  type        = string
  description = "VAPID contact subject, usually a mailto address."
  default     = "mailto:admin@wyndhamtuskers.com"
}
