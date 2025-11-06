resource "aws_s3_bucket" "main" {
  bucket = "healthcare-phi-storage-${var.environment}-${data.aws_caller_identity.current.account_id}"
  
  tags = {
    Name = "healthcare-phi-storage-${var.environment}"
    HIPAA = "true"
  }
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "main" {
  bucket = aws_s3_bucket.main.id
  
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access-logs/"
}

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  
  rule {
    id     = "transition-to-glacier"
    status = "Enabled"
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }
  }
}
# S3 bucket for logs
resource "aws_s3_bucket" "logs" {
  bucket = "healthcare-logs-${var.environment}-${data.aws_caller_identity.current.account_id}"
  
  tags = {
    Name = "healthcare-logs-${var.environment}"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudTrail S3 bucket
resource "aws_s3_bucket" "cloudtrail" {
  bucket = "healthcare-cloudtrail-${var.environment}-${data.aws_caller_identity.current.account_id}"
  
  tags = {
    Name = "healthcare-cloudtrail-${var.environment}"
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

data "aws_caller_identity" "current" {}

output "s3_bucket_name" {
  value = aws_s3_bucket.main.id
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.main.arn
}
```

### infrastructure/terraform/appsync.tf

```hcl
resource "aws_appsync_graphql_api" "main" {
  name                = "healthcare-api-${var.environment}"
  authentication_type = "AMAZON_COGNITO_USER_POOLS"
  
  user_pool_config {
    default_action = "ALLOW"
    user_pool_id   = aws_cognito_user_pool.main.id
    aws_region     = var.aws_region
  }
  
  additional_authentication_provider {
    authentication_type = "AWS_IAM"
  }
  
  log_config {
    cloudwatch_logs_role_arn = aws_iam_role.appsync_logs.arn
    field_log_level          = "ALL"
  }
  
  xray_enabled = true
  
  tags = {
    Name = "healthcare-appsync-${var.environment}"
  }
}

resource "aws_iam_role" "appsync_logs" {
  name = "healthcare-appsync-logs-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "appsync.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "appsync_logs" {
  name = "healthcare-appsync-logs-policy"
  role = aws_iam_role.appsync_logs.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

output "appsync_api_id" {
  value = aws_appsync_graphql_api.main.id
}

output "appsync_api_url" {
  value = aws_appsync_graphql_api.main.uris["GRAPHQL"]
}