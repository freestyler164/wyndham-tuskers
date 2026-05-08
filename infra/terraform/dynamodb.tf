resource "aws_dynamodb_table" "members" {
  name         = local.table_names.members
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "tokens" {
  name         = local.table_names.tokens
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"
  range_key    = "token"

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "token"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "surveys" {
  name         = local.table_names.surveys
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "responses" {
  name         = local.table_names.responses
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "surveyId"
  range_key    = "responseId"

  attribute {
    name = "surveyId"
    type = "S"
  }

  attribute {
    name = "responseId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "events" {
  name         = local.table_names.events
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

