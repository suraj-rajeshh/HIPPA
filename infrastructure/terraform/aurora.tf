resource "aws_rds_cluster" "main" {
  cluster_identifier     = "healthcare-aurora-${var.environment}"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = "15.4"
  database_name          = "healthcare"
  master_username        = "healthcare_admin"
  master_password        = random_password.db_password.result
  
  serverlessv2_scaling_configuration {
    max_capacity = 2.0
    min_capacity = 0.5
  }
  
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  
  storage_encrypted      = true
  kms_key_id            = aws_kms_key.main.arn
  
  backup_retention_period = 35
  preferred_backup_window = "03:00-04:00"
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  deletion_protection = var.environment == "prod" ? true : false
  skip_final_snapshot = var.environment != "prod"
  
  tags = {
    Name = "healthcare-aurora-${var.environment}"
    HIPAA = "true"
  }
}

resource "aws_rds_cluster_instance" "main" {
  count              = 2
  identifier         = "healthcare-aurora-instance-${count.index}-${var.environment}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  
  performance_insights_enabled = true
  performance_insights_kms_key_id = aws_kms_key.main.arn
  
  tags = {
    Name = "healthcare-aurora-instance-${count.index}-${var.environment}"
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "healthcare-db-subnet-group-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
  
  tags = {
    Name = "healthcare-db-subnet-group-${var.environment}"
  }
}

resource "aws_security_group" "aurora" {
  name        = "healthcare-aurora-sg-${var.environment}"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "healthcare-aurora-sg-${var.environment}"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "healthcare/aurora/${var.environment}/credentials"
  kms_key_id = aws_kms_key.main.id
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_rds_cluster.main.master_username
    password = random_password.db_password.result
    host     = aws_rds_cluster.main.endpoint
    port     = 5432
    database = aws_rds_cluster.main.database_name
  })
}

# Enable RDS Data API
resource "aws_rds_cluster_parameter_group" "main" {
  name   = "healthcare-cluster-pg-${var.environment}"
  family = "aurora-postgresql15"
  
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

output "aurora_cluster_arn" {
  value = aws_rds_cluster.main.arn
}

output "aurora_cluster_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "aurora_secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}