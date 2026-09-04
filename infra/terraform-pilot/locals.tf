data "aws_caller_identity" "current" {}

locals {
  name_prefix             = "${var.project_name}-${var.environment}"
  hosted_zone_lookup_name = var.hosted_zone_name != "" ? var.hosted_zone_name : var.domain_name
  frontend_dist_dir       = abspath("${path.module}/${var.frontend_dist_dir}")
  lambda_zip_path         = abspath("${path.module}/${var.lambda_zip_path}")
  domain_names            = distinct(concat([var.domain_name], var.additional_domain_names))
  canonical_domain_name   = var.canonical_domain_name != "" ? var.canonical_domain_name : var.domain_name
  app_url                 = "https://${local.canonical_domain_name}"
  allowed_origins         = join(",", [for domain in local.domain_names : "https://${domain}"])

  table_names = {
    members              = "${local.name_prefix}-members"
    tokens               = "${local.name_prefix}-password-reset-tokens"
    surveys              = "${local.name_prefix}-surveys"
    responses            = "${local.name_prefix}-survey-responses"
    events               = "${local.name_prefix}-events"
    news                 = "${local.name_prefix}-news"
    marketplace          = "${local.name_prefix}-marketplace"
    gallery              = "${local.name_prefix}-gallery"
    settings             = "${local.name_prefix}-settings"
    painting_competition = "${local.name_prefix}-painting-competition"
    painting_submissions = "${local.name_prefix}-painting-submissions"
    onam_schedule        = "${local.name_prefix}-onam-schedule"
  }

  content_types = {
    html  = "text/html"
    css   = "text/css"
    js    = "application/javascript"
    mjs   = "application/javascript"
    json  = "application/json"
    png   = "image/png"
    jpg   = "image/jpeg"
    jpeg  = "image/jpeg"
    gif   = "image/gif"
    svg   = "image/svg+xml"
    webp  = "image/webp"
    ico   = "image/x-icon"
    txt   = "text/plain"
    pdf   = "application/pdf"
    mp4   = "video/mp4"
    webm  = "video/webm"
    woff  = "font/woff"
    woff2 = "font/woff2"
  }

  tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "serverless-pilot"
    },
    var.tags
  )
}

data "aws_route53_zone" "selected" {
  count        = var.route53_zone_id == "" ? 1 : 0
  name         = "${local.hosted_zone_lookup_name}."
  private_zone = false
}

locals {
  route53_zone_id = var.route53_zone_id != "" ? var.route53_zone_id : data.aws_route53_zone.selected[0].zone_id
}
