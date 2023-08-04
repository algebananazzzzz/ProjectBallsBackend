output "function_name" {
  value = {
    for key, fn in module.lambda :
    key => fn.function_name
  }
}

output "api_gateway_integration_urls" {
  value = {
    for key, api in module.api :
    key => api.api_gateway_integration_url
  }
}

output "user_pool_id" {
  value = module.cognito[0].user_pool_id
}

output "client_id" {
  value = module.cognito[0].client_id
}

output "identity_id" {
  value = module.cognito[0].identity_id
}

output "databucket_name" {
  value = aws_s3_bucket.bucket.bucket
}
