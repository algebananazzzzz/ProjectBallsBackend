provider "aws" {
  shared_credentials_files = [".aws/credentials"]
  region                   = var.aws_region
  profile                  = "default"
}

locals {
  general_config       = yamldecode(file(format("${path.root}/%s", var.infrastructure_config_filename)))
  application_name     = local.general_config.application_name
  dynamodb_config      = lookup(local.general_config, "dynamodb", {})
  cognito_config       = lookup(local.general_config, "cognito", {})
  lambda_config        = lookup(local.general_config, "lambda", {})
  api_config           = lookup(local.general_config, "api_lambda_integration", {})
  s3_config            = lookup(local.general_config, "s3", {})
  lambda_function_name = format("%sfunction-%s", local.application_name, var.application_stage)
}

module "cognito" {
  count                = length(local.cognito_config) != 0 ? 1 : 0
  source               = "./.polymer/.tf_modules/cognito"
  application_name     = local.application_name
  pool_name            = format("%s%s-pool", local.application_name, var.application_stage)
  client_name          = format("%s%s-client", local.application_name, var.application_stage)
  usergroups           = contains(keys(local.cognito_config), "usergroups") ? toset(local.cognito_config.usergroups) : []
  custom_attributes    = contains(keys(local.cognito_config), "custom_attributes") ? local.cognito_config.custom_attributes : {}
  identity_pool_config = contains(keys(local.cognito_config), "identity_pool") ? local.cognito_config.identity_pool : null
  identity_pool_authenticated_policy = {
    "s3Permissions" : {
      "effect" : "Allow",
      "actions" : [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "resources" : [
        "${aws_s3_bucket.bucket.arn}/*/*/videofile.mp4",
        "${aws_s3_bucket.bucket.arn}/*/*/snippets/*"
      ]
    }
  }
}

resource "aws_s3_bucket" "bucket" {
  bucket = local.s3_config.data_bucket.name
}

resource "aws_s3_bucket_cors_configuration" "cors" {
  bucket = aws_s3_bucket.bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = [
      "GET",
      "HEAD",
      "PUT",
      "POST",
      "DELETE"
    ]
    allowed_origins = ["*"]
    expose_headers = [
      "x-amz-server-side-encryption",
      "x-amz-request-id",
      "x-amz-id-2",
      "ETag"
    ]
    max_age_seconds = 3000
  }
}

module "dynamodb" {
  count           = length(local.dynamodb_config) != 0 ? 1 : 0
  source          = "./.polymer/.tf_modules/dynamodb"
  dynamodb_config = local.dynamodb_config
}


module "lambda" {
  for_each             = local.lambda_config
  source               = "./.polymer/.tf_modules/lambda"
  application_name     = local.application_name
  application_stage    = var.application_stage
  lambda_function_name = format(each.value.function_name, var.application_stage)
  lambda_alias_name    = upper(var.application_stage)
  lambda_role_name     = format("${each.value.function_name}-role", var.application_stage)
  basedir              = format("${path.root}/%s", each.value.basedir)
  envfile_basedir      = format("${path.root}/%s", each.value.envfile_basedir)
}

module "codedeploy" {
  for_each             = local.lambda_config
  source               = "./.polymer/.tf_modules/codedeploy"
  application_stage    = var.application_stage
  lambda_function_name = module.lambda[each.key].function_name
  lambda_version       = module.lambda[each.key].version
  lambda_alias_name    = upper(var.application_stage)
  lambda_alias_version = module.lambda[each.key].alias_version
  deployment_config    = var.deployment_config
  aws_region           = var.aws_region

  depends_on = [
    module.lambda
  ]
}

module "api" {
  for_each             = local.api_config
  source               = "./.polymer/.tf_modules/api"
  api_gateway_name     = format("%s%s-api", local.application_name, var.application_stage)
  lambda_function_name = module.lambda[each.key].function_name
  lambda_alias_name    = upper(var.application_stage)
  application_stage    = var.application_stage
  lambda_alias_arn     = module.lambda[each.key].alias_arn
  cors_handler_name    = lookup(each.value, "cors_handler_name", "")
  cors_configuration   = contains(keys(each.value), "cors_configuration") ? [each.value.cors_configuration] : []

  depends_on = [
    module.lambda
  ]
}

