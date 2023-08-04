# ProjectBallsBackend

ProjectBallsBackend is a backend solution developed using PolymerBase, a powerful framework created by Algebananazzzzz. It serves as a starter template for creating robust CI/CD-enabled pipelines that leverage Terraform to provision AWS resources.

PolymerBase Repository: [algebananazzzzz/PolymerBase](https://github.com/algebananazzzzz/PolymerBase)

## Overview

The ProjectBallsBackend repository offers a structured workflow to set up and deploy AWS resources for the backend of the ProjectBalls app. It utilizes PolymerBase's features to streamline the process, making it easier to manage infrastructure and deployments.

## Infrastructure as Code (IaC)

The infrastructure for the backend is defined in the `.polymer/infrastructure.yml` file. This YAML file outlines the necessary AWS resources, such as DynamoDB tables, S3 buckets, and Cognito user pools, required for the app's functionality.

## Configuration Management

The `.polymer/infrastructure.yml` file is the source of truth for the app's configuration. It serves as the basis for generating the `app/src/app_config.json` configuration file that the Apollo Server uses for its setup.

## Terraform Provisioning

Terraform is used to provision AWS resources based on the definitions provided in the `.polymer/infrastructure.yml` file. Custom Terraform modules defined in the `.polymer/tf_modules` folder enhance the modularity and reusability of the provisioning process.

## CI/CD Pipeline

1. Commits to the repository trigger GitHub Actions workflows.
2. GitHub Actions configures the required Node.js modules for deployment.
3. The workflow sets up necessary environment secrets and variables for secure deployment.
4. If not already present, the workflow creates a workspace in Terraform Cloud to manage deployments effectively.
5. Webpack compiles the `src` folder into `app/dist/`, generating the source for the Lambda function.
6. A zip file of `app/dist/` is created for deployment.
7. Terraform Cloud utilizes secret access keys to provision AWS resources as defined in the infrastructure.
8. AWS resources, such as Lambda functions, API Gateway, S3 buckets, and DynamoDB tables, are provisioned and configured.
9. Different environment branches (e.g., `dev`, `test`, `prod`) can push to separate workspaces and environments in Terraform Cloud, allowing for isolation and controlled deployments.

## Explore the Live Website

To see ProjectBallsBackend in action, explore the live website: [ProjectBalls Live Website](https://www.projectballsbackend.com)

For detailed setup instructions and documentation, refer to the [PolymerBase Repository](https://github.com/algebananazzzzz/PolymerBase).

We highly recommend developers to use the PolymerBase template as a foundation for their projects.

Happy coding!
