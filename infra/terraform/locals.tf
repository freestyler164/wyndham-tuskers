data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix             = "${var.project_name}-${var.environment}"
  azs                     = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  hosted_zone_lookup_name = var.hosted_zone_name != "" ? var.hosted_zone_name : var.domain_name
}

data "aws_route53_zone" "selected" {
  count        = var.domain_name != "" && var.route53_zone_id == "" ? 1 : 0
  name         = "${local.hosted_zone_lookup_name}."
  private_zone = false
}

locals {
  route53_zone_id = var.route53_zone_id != "" ? var.route53_zone_id : try(data.aws_route53_zone.selected[0].zone_id, "")
  use_domain      = var.domain_name != "" && local.route53_zone_id != ""
  app_url         = local.use_domain ? "https://${var.domain_name}" : "http://${aws_lb.app.dns_name}"

  table_names = {
    members   = "${local.name_prefix}-members"
    tokens    = "${local.name_prefix}-password-reset-tokens"
    surveys   = "${local.name_prefix}-surveys"
    responses = "${local.name_prefix}-survey-responses"
    events    = "${local.name_prefix}-events"
  }

  task_subnet_ids  = var.enable_nat_gateway ? aws_subnet.private[*].id : aws_subnet.public[*].id
  assign_public_ip = var.enable_nat_gateway ? false : true

  tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )
}
