data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend_lambda" {
  name               = "${local.name_prefix}-backend-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "backend_lambda_basic" {
  role       = aws_iam_role.backend_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "backend_lambda" {
  statement {
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:UpdateItem"
    ]

    resources = [
      aws_dynamodb_table.members.arn,
      "${aws_dynamodb_table.members.arn}/index/*",
      aws_dynamodb_table.tokens.arn,
      aws_dynamodb_table.surveys.arn,
      aws_dynamodb_table.responses.arn,
      aws_dynamodb_table.events.arn,
      aws_dynamodb_table.news.arn,
      aws_dynamodb_table.marketplace.arn,
      aws_dynamodb_table.gallery.arn,
      aws_dynamodb_table.settings.arn,
      aws_dynamodb_table.painting_competition.arn,
      aws_dynamodb_table.painting_submissions.arn,
      aws_dynamodb_table.onam_schedule.arn
    ]
  }

  statement {
    actions = [
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.painting_assets.arn}/*"]
  }

  statement {
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.frontend.arn}/static/photos/news/*",
      "${aws_s3_bucket.frontend.arn}/static/photos/marketplace/*",
      "${aws_s3_bucket.frontend.arn}/static/photos/onam-schedule/*"
    ]
  }

  # Gallery photos are removable from the admin page, so deletes are allowed on this prefix only.
  statement {
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.frontend.arn}/static/photos/gallery/*"]
  }

  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.jwt_secret.arn,
      aws_secretsmanager_secret.resend_api_key.arn
    ]
  }
}

resource "aws_iam_role_policy" "backend_lambda" {
  name   = "${local.name_prefix}-backend-access"
  role   = aws_iam_role.backend_lambda.id
  policy = data.aws_iam_policy_document.backend_lambda.json
}
