variable "pool_name" {
  type = string
}

variable "client_name" {
  type = string
}

variable "application_name" {
  type = string
}

variable "usergroups" {
  default = []
}

variable "custom_attributes" {
  default = {}
}

variable "ui_customisation" {
  default = null
}

variable "identity_pool_config" {
  default = null
}

variable "identity_pool_authenticated_policy" {
  default = {}
}