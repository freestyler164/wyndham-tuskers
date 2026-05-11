variable "project_name" {
  description = "Short project name used in AWS resource names."
  type        = string
  default     = "wyndham-tuskers"
}

variable "environment" {
  description = "Deployment environment name. Use pilot for the parallel test stack."
  type        = string
  default     = "pilot"
}

variable "aws_region" {
  description = "AWS region for Lambda, API Gateway, DynamoDB, logs, and secrets."
  type        = string
  default     = "ap-southeast-2"
}

variable "domain_name" {
  description = "Custom domain for the pilot app."
  type        = string
  default     = "pilot.wyndhamtuskers.com"
}

variable "additional_domain_names" {
  description = "Additional domains to attach to the same CloudFront distribution, for example wyndhamtuskers.com during cutover."
  type        = list(string)
  default     = []
}

variable "canonical_domain_name" {
  description = "Canonical frontend domain used for backend-generated links. Defaults to domain_name when empty."
  type        = string
  default     = ""
}

variable "hosted_zone_name" {
  description = "Existing public Route 53 hosted zone name."
  type        = string
  default     = "wyndhamtuskers.com"
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted zone ID override."
  type        = string
  default     = ""
}

variable "frontend_dist_dir" {
  description = "Path to the built Vite frontend dist directory."
  type        = string
  default     = "../../frontend/dist"
}

variable "lambda_zip_path" {
  description = "Path to the prebuilt backend Lambda zip."
  type        = string
  default     = "../../build/backend-lambda.zip"
}

variable "lambda_memory_size" {
  description = "Backend Lambda memory in MB."
  type        = number
  default     = 512
}

variable "lambda_timeout_seconds" {
  description = "Backend Lambda timeout in seconds."
  type        = number
  default     = 15
}

variable "jwt_secret" {
  description = "JWT signing secret. Leave empty to let Terraform create one in Secrets Manager."
  type        = string
  default     = ""
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key. Prefer passing this as TF_VAR_resend_api_key or a secrets tfvars file."
  type        = string
  default     = ""
  sensitive   = true
}

variable "email_from" {
  description = "Verified Resend sender address."
  type        = string
  default     = "Wyndham Tuskers <no-reply@wyndhamtuskers.com>"
}

variable "enable_member_registration" {
  description = "Whether the public member registration form and signup endpoint are enabled."
  type        = bool
  default     = false
}

variable "password_min_length" {
  description = "Minimum password length enforced by the backend."
  type        = number
  default     = 12
}

variable "auth_rate_limit_max" {
  description = "Maximum login/reset attempts per 15-minute window per client IP."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}

variable "cloudfront_price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

variable "tags" {
  description = "Additional AWS tags."
  type        = map(string)
  default     = {}
}
