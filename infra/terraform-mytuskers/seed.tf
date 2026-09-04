locals {
  admin_user_id         = "user-admin"
  admin_user_created_at = "2026-07-20T00:00:00.000Z"
  admin_user_first_name = split(" ", trimspace(var.admin_user_display_name))[0]
}

resource "aws_dynamodb_table_item" "admin_user" {
  table_name = aws_dynamodb_table.core.name
  hash_key   = aws_dynamodb_table.core.hash_key
  range_key  = aws_dynamodb_table.core.range_key

  item = jsonencode({
    PK = {
      S = "USER#${local.admin_user_id}"
    }
    SK = {
      S = "PROFILE"
    }
    GSI1PK = {
      S = "PHONE#${var.admin_user_phone}"
    }
    GSI1SK = {
      S = "USER#${local.admin_user_id}"
    }
    entityType = {
      S = "USER"
    }
    userId = {
      S = local.admin_user_id
    }
    phone = {
      S = var.admin_user_phone
    }
    email = {
      S = var.admin_user_email
    }
    emailVerifiedAt = {
      S = local.admin_user_created_at
    }
    passwordHash = {
      S = var.admin_user_password_hash
    }
    passwordUpdatedAt = {
      S = local.admin_user_created_at
    }
    displayName = {
      S = var.admin_user_display_name
    }
    preferredName = {
      S = local.admin_user_first_name
    }
    initials = {
      S = upper(substr(local.admin_user_first_name, 0, 2))
    }
    needsProfile = {
      BOOL = false
    }
    onboardingCompletedAt = {
      S = local.admin_user_created_at
    }
    globalRole = {
      S = "GLOBAL_ADMIN"
    }
    playingRole = {
      S = "BATTER"
    }
    createdAt = {
      S = local.admin_user_created_at
    }
    updatedAt = {
      S = local.admin_user_created_at
    }
  })
}
