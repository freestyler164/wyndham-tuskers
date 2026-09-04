locals {
  name_prefix         = "${var.project_name}-${var.environment}"
  frontend_dist_dir   = abspath("${path.module}/${var.frontend_dist_dir}")
  lambda_zip_path     = abspath("${path.module}/${var.lambda_zip_path}")
  domain_names        = compact(concat([var.domain_name], var.additional_domain_names))
  use_custom_domain   = length(local.domain_names) > 0
  managed_certificate = local.use_custom_domain && var.cloudfront_certificate_arn == ""
  web_origin          = local.use_custom_domain ? "https://${var.domain_name}" : ""

  content_types = {
    css         = "text/css"
    gif         = "image/gif"
    html        = "text/html"
    ico         = "image/x-icon"
    jpeg        = "image/jpeg"
    jpg         = "image/jpeg"
    js          = "application/javascript"
    json        = "application/json"
    map         = "application/json"
    png         = "image/png"
    svg         = "image/svg+xml"
    txt         = "text/plain"
    webmanifest = "application/manifest+json"
    webp        = "image/webp"
    woff        = "font/woff"
    woff2       = "font/woff2"
  }
}

data "aws_route53_zone" "app" {
  count        = local.use_custom_domain && var.create_dns_records ? 1 : 0
  name         = var.hosted_zone_name
  private_zone = false
}
