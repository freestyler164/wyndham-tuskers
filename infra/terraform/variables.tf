variable "project_name" {
  description = "Short project name used in AWS resource names."
  type        = string
  default     = "wyndham-tuskers"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-southeast-2"
}

variable "vpc_cidr" {
  description = "CIDR block for the application VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to use."
  type        = number
  default     = 2
}

variable "enable_nat_gateway" {
  description = "Place ECS tasks in private subnets with NAT egress. Disable for a lower-cost public-subnet setup."
  type        = bool
  default     = true
}

variable "image_tag" {
  description = "Container image tag deployed to both frontend and backend services."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Number of frontend and backend ECS tasks to run."
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum ECS task count when autoscaling is enabled."
  type        = number
  default     = 3
}

variable "autoscaling_enabled" {
  description = "Enable ECS CPU target-tracking autoscaling."
  type        = bool
  default     = true
}

variable "autoscaling_cpu_target" {
  description = "Average ECS service CPU percentage to target."
  type        = number
  default     = 60
}

variable "frontend_cpu" {
  description = "Frontend task CPU units."
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Frontend task memory in MiB."
  type        = number
  default     = 512
}

variable "backend_cpu" {
  description = "Backend task CPU units."
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Backend task memory in MiB."
  type        = number
  default     = 1024
}

variable "jwt_secret" {
  description = "JWT signing secret. Leave empty to let Terraform create one in Secrets Manager."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ses_sender_email" {
  description = "Email address used as the SES sender for password reset emails."
  type        = string
  default     = "club@wyndhamtuskers.org"
}

variable "enable_member_registration" {
  description = "Whether new signups immediately become members. Keep false to use the pending approval workflow."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Optional custom domain name for the ALB, for example wyndhamtuskers.com."
  type        = string
  default     = ""
}

variable "hosted_zone_name" {
  description = "Optional Route 53 hosted zone name. Defaults to domain_name when route53_zone_id is empty."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted zone ID override. If empty, Terraform looks up hosted_zone_name or domain_name."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "ecr_force_delete" {
  description = "Allow Terraform destroy to delete non-empty ECR repositories."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional AWS tags."
  type        = map(string)
  default     = {}
}
