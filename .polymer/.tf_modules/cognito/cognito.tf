resource "aws_cognito_user_pool_client" "client" {
  name         = var.client_name
  user_pool_id = aws_cognito_user_pool.pool.id
}

resource "aws_cognito_user_pool_ui_customization" "custom" {
  count        = (var.ui_customisation == null) ? 0 : 1
  client_id    = aws_cognito_user_pool_client.client.id
  user_pool_id = aws_cognito_user_pool.pool.id
  css          = file(format("${path.root}/%s", var.ui_customisation))
  depends_on   = [aws_cognito_user_pool_client.client]
}

resource "aws_cognito_user_pool" "pool" {
  name                     = var.pool_name
  alias_attributes         = ["preferred_username", "email"]
  auto_verified_attributes = ["email"]

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "${var.application_name} Account Verification"
    email_message        = "Your confirmation code is {####}"
  }

  dynamic "schema" {
    for_each = var.custom_attributes

    content {
      name                     = schema.key
      attribute_data_type      = schema.value.type == "S" ? "String" : schema.value.type == "N" ? "Number" : "Unknown"
      developer_only_attribute = false
      mutable                  = true
      required                 = false

      dynamic "string_attribute_constraints" {
        for_each = schema.value.type == "S" ? [schema.value] : []

        content {
          min_length = string_attribute_constraints.value.min_length
          max_length = string_attribute_constraints.value.max_length
        }
      }

      dynamic "number_attribute_constraints" {
        for_each = schema.value.type == "N" ? [schema.value] : []

        content {
          min_value = number_attribute_constraints.value.min_value
          max_value = number_attribute_constraints.value.max_value
        }
      }
    }
  }
}

resource "aws_cognito_user_group" "group" {
  for_each     = var.usergroups
  name         = each.value
  user_pool_id = aws_cognito_user_pool.pool.id
  description  = "Managed by Terraform"
}

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = var.identity_pool_config.name
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.client.id
    provider_name           = aws_cognito_user_pool.pool.endpoint
    server_side_token_check = false
  }
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }

    actions = ["sts:AssumeRoleWithWebIdentity"]

    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.main.id]
    }

    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["authenticated"]
    }
  }
}

resource "aws_iam_role" "authenticated" {
  name               = "${var.identity_pool_config.name}-AuthenticatedRole"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

data "aws_iam_policy_document" "authenticated_role_policy" {
  statement {
    effect = "Allow"

    actions = [
      "mobileanalytics:PutEvents",
      "cognito-sync:*",
      "cognito-identity:*",
    ]

    resources = ["*"]
  }

  dynamic "statement" {
    for_each = var.identity_pool_authenticated_policy

    content {
      sid       = statement.key
      effect    = statement.value["effect"]
      actions   = statement.value["actions"]
      resources = statement.value["resources"]
    }
  }
}

resource "aws_iam_role_policy" "authenticated" {
  name   = "${var.identity_pool_config.name}-AuthenticatedPolicy"
  role   = aws_iam_role.authenticated.id
  policy = data.aws_iam_policy_document.authenticated_role_policy.json
}

resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    "authenticated" = aws_iam_role.authenticated.arn
  }
}
