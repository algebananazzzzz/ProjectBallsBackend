output "function_name" {
  value = aws_lambda_function.lambda.function_name
}

output "function_arn" {
  value = aws_lambda_function.lambda.arn
}

output "version" {
  value = aws_lambda_function.lambda.version
}

output "alias_version" {
  value = aws_lambda_alias.lambda.function_version
}

output "alias_arn" {
  value = aws_lambda_alias.lambda.arn
}
