terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "healthcare-terraform-state"
    key    = "healthcare/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "Healthcare-HIPAA"
      ManagedBy   = "Terraform"
      Compliance  = "HIPAA"
    }
  }
}

# KMS Key for encryption
resource "aws_kms_key" "main" {
  description             = "Healthcare System Encryption Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Name = "healthcare-encryption-key-${var.environment}"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/healthcare-${var.environment}"
  target_key_id = aws_kms_key.main.key_id
}

# VPC Configuration
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "healthcare-vpc-${var.environment}"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  tags = {
    Name = "healthcare-private-subnet-${count.index + 1}-${var.environment}"
  }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  
  tags = {
    Name = "healthcare-public-subnet-${count.index + 1}-${var.environment}"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# CloudTrail for audit logging
resource "aws_cloudtrail" "main" {
  name                          = "healthcare-trail-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.main.arn
  
  event_selector {
    read_write_type           = "All"
    include_management_events = true
    
    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.main.arn}/"]
    }
  }
}

# GuardDuty
resource "aws_guardduty_detector" "main" {
  enable = true
  
  datasources {
    s3_logs {
      enable = true
    }
  }
}

# Outputs
output "kms_key_id" {
  value = aws_kms_key.main.id
}

output "kms_key_arn" {
  value = aws_kms_key.main.arn
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
```

### infrastructure/terraform/cognito.tf

```hcl
resource "aws_cognito_user_pool" "main" {
  name = "healthcare-users-${var.environment}"
  
  username_attributes = ["email"]
  auto_verified_attributes = ["email"]
  
  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
  
  mfa_configuration = "OPTIONAL"
  
  software_token_mfa_configuration {
    enabled = true
  }
  
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
  
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = false
  }
  
  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true
    
    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }
  
  schema {
    name                = "userType"
    attribute_data_type = "String"
    mutable             = true
    
    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }
  
  tags = {
    Name = "healthcare-cognito-pool-${var.environment}"
    HIPAA = "true"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "healthcare-web-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id
  
  generate_secret = false
  
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]
  
  refresh_token_validity = 30
  access_token_validity  = 1
  id_token_validity      = 1
  
  token_validity_units {
    refresh_token = "days"
    access_token  = "hours"
    id_token      = "hours"
  }
  
  read_attributes  = ["email", "custom:role", "custom:userType"]
  write_attributes = ["email"]
}

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "healthcare-mobile-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id
  
  generate_secret = true
  
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  
  refresh_token_validity = 30
  access_token_validity  = 1
  id_token_validity      = 1
  
  token_validity_units {
    refresh_token = "days"
    access_token  = "hours"
    id_token      = "hours"
  }
}

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "healthcare_identity_pool_${var.environment}"
  allow_unauthenticated_identities = false
  
  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.web.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = true
  }
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_arn" {
  value = aws_cognito_user_pool.main.arn
}

output "cognito_web_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_mobile_client_id" {
  value = aws_cognito_user_pool_client.mobile.id
}

output "cognito_identity_pool_id" {
  value = aws_cognito_identity_pool.main.id
}