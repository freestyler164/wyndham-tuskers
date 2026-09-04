resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_prefix}-web-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket" "receipts" {
  bucket = "${local.name_prefix}-receipts-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "receipts" {
  bucket                  = aws_s3_bucket.receipts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Feed photos are deliberately kept in S3 Standard for their whole life. A
# transition to Glacier or Infrequent Access would add per-retrieval cost and
# latency to images that render inline in the feed, so this rule only expires.
#
# Posts expire from DynamoDB after 30 days, so media must outlive them; 35 days
# leaves headroom for TTL sweep lag, which AWS documents as up to 48 hours.
resource "aws_s3_bucket_lifecycle_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  rule {
    id     = "feed-media-expiry"
    status = "Enabled"

    filter {
      prefix = "feed-media/"
    }

    expiration {
      days = 35
    }

    # The bucket is versioned, so expiring an object only writes a delete marker
    # and the bytes live on as a noncurrent version. Without this the storage is
    # never actually reclaimed.
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  # AWS rejects days and expired_object_delete_marker in one expiration block,
  # so sweeping the leftover markers needs its own rule.
  rule {
    id     = "feed-media-delete-markers"
    status = "Enabled"

    filter {
      prefix = "feed-media/"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_object" "frontend" {
  for_each = fileset(local.frontend_dist_dir, "**")

  bucket       = aws_s3_bucket.frontend.id
  key          = each.value
  source       = "${local.frontend_dist_dir}/${each.value}"
  etag         = filemd5("${local.frontend_dist_dir}/${each.value}")
  content_type = lookup(local.content_types, lower(regex("[^.]+$", each.value)), "application/octet-stream")
}
