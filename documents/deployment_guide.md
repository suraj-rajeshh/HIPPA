# HIPAA-Compliant Healthcare System - Complete Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Setup](#pre-deployment-setup)
3. [Deployment Steps](#deployment-steps)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Verification and Testing](#verification-and-testing)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Tools

#### 1. AWS CLI (Version 2.x or higher)
**Installation:**
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows
# Download and run: https://awscli.amazonaws.com/AWSCLIV2.msi
```

**Verification:**
```bash
aws --version
# Expected output: aws-cli/2.x.x
```

#### 2. Terraform (Version 1.5.x or higher)
**Installation:**
```bash
# macOS
brew install terraform

# Linux
wget https://releases.hashicorp.com/terraform/1.5.0/terraform_1.5.0_linux_amd64.zip
unzip terraform_1.5.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Windows
# Download from: https://www.terraform.io/downloads
```

**Verification:**
```bash
terraform --version
# Expected output: Terraform v1.5.x
```

#### 3. Serverless Framework (Version 3.x)
**Installation:**
```bash
npm install -g serverless
```

**Verification:**
```bash
serverless --version
# Expected output: Framework Core: 3.x.x
```

#### 4. Node.js (Version 20.x LTS)
**Installation:**
```bash
# macOS
brew install node@20

# Linux (using nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Windows
# Download from: https://nodejs.org/
```

**Verification:**
```bash
node --version
# Expected output: v20.x.x
```

#### 5. jq (JSON processor)
**Installation:**
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq

# Windows
# Download from: https://stedolan.github.io/jq/
```

### AWS Account Requirements

#### 1. IAM Permissions
Your AWS user/role must have permissions for:
- VPC, EC2 (networking)
- RDS (Aurora)
- S3
- Lambda
- API Gateway
- AppSync
- Cognito
- IAM (role creation)
- CloudFormation
- KMS
- CloudWatch
- CloudTrail
- GuardDuty
- Secrets Manager

**Recommended:** Use `AdministratorAccess` policy for initial deployment (restrict after setup)

#### 2. Service Limits
Verify your account has sufficient limits:
```bash
# Check VPC limits
aws ec2 describe-account-attributes --attribute-names max-elastic-ips

# Check Lambda limits
aws lambda get-account-settings --region us-east-1
```

#### 3. Cost Considerations
**Estimated Monthly Costs (Development Environment):**
- Aurora Serverless v2: $50-100
- Lambda: $10-30
- AppSync: $10-20
- S3: $5-10
- Cognito: $0-5 (first 50,000 MAU free)
- CloudWatch: $5-15
- **Total Estimate: $80-180/month**

**Production Environment:** Expect 2-3x higher costs with increased traffic and redundancy.

---

## Pre-Deployment Setup

### Step 1: Configure AWS Credentials

#### Option A: Using AWS CLI
```bash
aws configure --profile healthcare-dev

# Enter when prompted:
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region: us-east-1
# Default output format: json
```

#### Option B: Using Environment Variables
```bash
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY"
export AWS_DEFAULT_REGION="us-east-1"
export AWS_PROFILE="healthcare-dev"
```

**Verify credentials:**
```bash
aws sts get-caller-identity --profile healthcare-dev
```

### Step 2: Create Terraform State Bucket

```bash
# Get your AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create S3 bucket for Terraform state
aws s3api create-bucket \
  --bucket healthcare-system-terraform-state-${AWS_ACCOUNT_ID} \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket healthcare-system-terraform-state-${AWS_ACCOUNT_ID} \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket healthcare-system-terraform-state-${AWS_ACCOUNT_ID} \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name healthcare-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Step 3: Clone Repository and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-org/healthcare-system.git
cd healthcare-system

# Install root dependencies
npm install

# Install service dependencies
cd services/auth-service && npm install && cd ../..
cd services/patient-service && npm install && cd ../..
cd services/appointment-service && npm install && cd ../..
cd services/medical-records-service && npm install && cd ../..
```

### Step 4: Configure Environment Variables

Create environment-specific configuration files:

**File: `infrastructure/terraform/environments/dev.tfvars`**
```hcl
environment         = "dev"
aws_region          = "us-east-1"
project_name        = "healthcare-system"

# VPC Configuration
vpc_cidr            = "10.0.0.0/16"
availability_zones  = ["us-east-1a", "us-east-1b"]

# Aurora Configuration
db_instance_class   = "db.serverless"
db_min_capacity     = 0.5
db_max_capacity     = 2.0

# Tags
tags = {
  Environment = "dev"
  Project     = "healthcare-system"
  ManagedBy   = "terraform"
  Compliance  = "HIPAA"
}
```

**File: `.env.dev`**
```bash
ENVIRONMENT=dev
AWS_REGION=us-east-1
AWS_PROFILE=healthcare-dev
PROJECT_NAME=healthcare-system
NODE_ENV=development
LOG_LEVEL=debug
```

### Step 5: Review Terraform Configuration

Navigate to Terraform modules and review:

```bash
cd infrastructure/terraform

# Review the structure
tree -L 2
# Expected structure:
# ├── main.tf
# ├── variables.tf
# ├── outputs.tf
# ├── backend.tf
# └── modules/
#     ├── networking/
#     ├── database/
#     ├── storage/
#     ├── cognito/
#     └── monitoring/
```

---

## Deployment Steps

### Step 1: Check Prerequisites (Automated)

The deployment script will automatically check:
- ✅ AWS CLI installation
- ✅ Terraform installation
- ✅ Serverless Framework installation
- ✅ Node.js installation
- ✅ AWS credentials configuration
- ✅ AWS account access

**What happens:**
- Validates all required tools are installed
- Checks AWS credentials are valid
- Retrieves AWS Account ID
- Verifies access to AWS services

**Time:** ~30 seconds

**Potential Issues:**
- Missing tools → Install from Prerequisites section
- Invalid credentials → Reconfigure AWS CLI
- Insufficient permissions → Contact AWS administrator

---

### Step 2: Initialize Terraform

**What happens:**
- Downloads Terraform providers (AWS, random, etc.)
- Configures S3 backend for state storage
- Sets up DynamoDB for state locking
- Initializes all Terraform modules

**Commands executed:**
```bash
terraform init \
  -backend-config="bucket=healthcare-system-terraform-state-${AWS_ACCOUNT_ID}" \
  -backend-config="key=dev/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=healthcare-terraform-locks"
```

**Time:** 1-2 minutes

**Potential Issues:**
- S3 bucket doesn't exist → Create manually (see Pre-Deployment Setup)
- Permission denied → Check IAM permissions
- Backend configuration error → Verify bucket name and region

---

### Step 3: Deploy VPC and Networking

**What happens:**
- Creates VPC with CIDR block 10.0.0.0/16
- Creates 2 public subnets (for NAT gateways)
- Creates 2 private subnets (for Aurora, Lambda)
- Creates Internet Gateway
- Creates NAT Gateways (for private subnet internet access)
- Creates route tables and associations
- Creates security groups for database and Lambda

**Resources created:**
- 1 VPC
- 2 Public Subnets
- 2 Private Subnets
- 1 Internet Gateway
- 2 NAT Gateways
- 2 Elastic IPs (for NAT)
- 4 Route Tables
- 5+ Security Groups

**Terraform modules:**
```
modules/networking/
├── vpc.tf
├── subnets.tf
├── nat_gateway.tf
├── security_groups.tf
└── outputs.tf
```

**Time:** 3-5 minutes

**Outputs exported:**
- `VPC_ID`: Used by all subsequent deployments
- `PRIVATE_SUBNET_IDS`: For Aurora and Lambda
- `PUBLIC_SUBNET_IDS`: For NAT gateways

**Costs:**
- NAT Gateway: ~$32/month per AZ (2 AZs = $64/month)
- Elastic IPs: $0 (while attached)

**Potential Issues:**
- VPC limit reached → Request limit increase
- Elastic IP limit → Release unused IPs
- NAT Gateway creation timeout → Retry deployment

---

### Step 4: Deploy Aurora Serverless v2 Database

**What happens:**
- Creates Aurora Serverless v2 PostgreSQL cluster
- Configures encryption at rest with KMS
- Sets up automated backups (35-day retention)
- Enables point-in-time recovery
- Creates DB subnet group in private subnets
- Configures security groups (port 5432 from Lambda SG only)
- Stores master credentials in Secrets Manager

**Resources created:**
- 1 Aurora Serverless v2 Cluster
- 1 DB Subnet Group
- 1 KMS Key (for database encryption)
- 1 Secrets Manager Secret (for credentials)
- 1 CloudWatch Log Group

**Configuration:**
```hcl
engine                  = "aurora-postgresql"
engine_version          = "15.4"
database_name           = "healthcare"
master_username         = "dbadmin"
scaling_configuration {
  min_capacity = 0.5  # ACUs
  max_capacity = 2.0  # ACUs
}
backup_retention_period = 35  # HIPAA requirement
encryption_at_rest      = true
```

**Time:** 8-12 minutes

**Outputs exported:**
- `DB_ENDPOINT`: Database connection endpoint
- `DB_NAME`: Database name (healthcare)
- `DB_SECRET_ARN`: ARN of Secrets Manager secret

**Costs:**
- Aurora Serverless v2: $0.12/ACU-hour
- Minimum (0.5 ACU): ~$43/month
- Storage: $0.10/GB-month
- Backup storage: $0.021/GB-month

**Potential Issues:**
- Cluster creation timeout → Check VPC and subnet configuration
- KMS key creation failed → Verify KMS permissions
- Secret creation failed → Check Secrets Manager permissions

**Database Schema:**
The cluster is created but empty. Schema is created in the next step (migrations).

---

### Step 5: Run Database Migrations

**What happens:**
- Retrieves database credentials from Secrets Manager
- Connects to Aurora cluster
- Creates database schema
- Creates all tables (users, patients, appointments, medical_records, audit_logs)
- Creates indexes for performance
- Sets up foreign key constraints
- Creates database views (patient_dashboard, provider_dashboard)
- Seeds initial data (if configured)

**Tables created:**
1. **users** - Authentication and user management
2. **patients** - Patient demographics and information
3. **medical_histories** - Allergies, conditions, medications
4. **appointments** - Scheduling and appointment tracking
5. **medical_records** - Medical documentation
6. **audit_logs** - HIPAA compliance logging
7. **insurance_information** - Insurance policies
8. **emergency_contacts** - Emergency contact details

**Migration tool:** (Choose one based on your setup)
- Knex.js
- TypeORM
- Prisma
- Sequelize
- Custom SQL scripts

**Commands:**
```bash
# Set environment variables
export DATABASE_URL="postgresql://${DB_ENDPOINT}/healthcare"
export DB_SECRET_ARN="${DB_SECRET_ARN}"

# Run migrations
npm run migrate:dev
```

**Sample migration script structure:**
```sql
-- 001_create_users_table.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_user_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL,
  user_type VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cognito_id ON users(cognito_user_id);
```

**Time:** 2-3 minutes

**Verification:**
```bash
# Connect to database (if psql installed)
psql -h $DB_ENDPOINT -U dbadmin -d healthcare

# List tables
\dt

# Expected output:
# users, patients, appointments, medical_records, audit_logs, etc.
```

**Potential Issues:**
- Connection timeout → Check security group rules
- Permission denied → Verify database credentials
- Migration failed → Check SQL syntax, rollback and fix
- Table already exists → Check migration version tracking

---

### Step 6: Deploy S3 Storage with KMS Encryption

**What happens:**
- Creates S3 bucket for medical documents
- Enables versioning for all objects
- Configures server-side encryption with KMS
- Sets up bucket policies (deny unencrypted uploads)
- Configures lifecycle policies (transition to Glacier)
- Enables access logging
- Blocks all public access
- Creates KMS key with automatic rotation

**Resources created:**
- 1 S3 Bucket (healthcare-system-documents-{account-id}-{env})
- 1 KMS Key (for S3 encryption)
- 1 KMS Key Alias
- 1 S3 Access Logging Bucket
- Bucket policies and CORS configuration

**S3 Configuration:**
```hcl
versioning {
  enabled = true
}

server_side_encryption_configuration {
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.documents.id
    }
  }
}

lifecycle_rule {
  enabled = true
  
  transition {
    days          = 90
    storage_class = "GLACIER"
  }
  
  transition {
    days          = 365
    storage_class = "DEEP_ARCHIVE"
  }
}
```

**KMS Key Configuration:**
```hcl
enable_key_rotation = true
deletion_window_in_days = 30

policy = {
  # Allow root account
  # Allow Lambda execution roles
  # Deny unencrypted puts
}
```

**Time:** 2-3 minutes

**Outputs exported:**
- `DOCUMENTS_BUCKET`: S3 bucket name
- `KMS_KEY_ID`: KMS key for encryption

**Costs:**
- S3 Storage: $0.023/GB-month (first 50TB)
- S3 Requests: $0.0004 per 1,000 PUT requests
- KMS: $1/month per key + $0.03 per 10,000 requests
- Glacier: $0.004/GB-month (after 90 days)

**Potential Issues:**
- Bucket name conflict → Bucket names are globally unique
- KMS key policy error → Check IAM permissions
- Public access block failed → Check account-level settings

---

### Step 7: Deploy AWS Cognito User Pools

**What happens:**
- Creates Cognito User Pool
- Configures password policies (HIPAA-compliant)
- Creates 3 app clients (Staff, Patient, Guardian)
- Configures MFA settings (optional)
- Sets up email verification
- Configures user attributes (email, name, role)
- Creates Lambda triggers (pre-signup, post-confirmation)

**Resources created:**
- 1 Cognito User Pool
- 3 Cognito User Pool Clients
- 1 User Pool Domain
- Lambda triggers (optional)

**User Pool Configuration:**
```hcl
password_policy {
  minimum_length    = 12
  require_lowercase = true
  require_uppercase = true
  require_numbers   = true
  require_symbols   = true
  temporary_password_validity_days = 1
}

mfa_configuration = "OPTIONAL"

account_recovery_setting {
  recovery_mechanism {
    name     = "verified_email"
    priority = 1
  }
}

schema {
  attribute_data_type = "String"
  name                = "email"
  required            = true
  mutable             = false
}

schema {
  attribute_data_type = "String"
  name                = "role"
  required            = false
  mutable             = true
}
```

**App Clients:**
1. **Staff Client** - For ADMIN, PROVIDER, NURSE, RECEPTIONIST
2. **Patient Client** - For PATIENT users
3. **Guardian Client** - For GUARDIAN users

**Time:** 3-4 minutes

**Outputs exported:**
- `USER_POOL_ID`: Cognito User Pool ID
- `STAFF_CLIENT_ID`: Staff app client ID
- `PATIENT_CLIENT_ID`: Patient app client ID
- `GUARDIAN_CLIENT_ID`: Guardian app client ID

**Costs:**
- First 50,000 MAU (Monthly Active Users): Free
- Additional MAU: $0.0055 per MAU

**Potential Issues:**
- User pool creation failed → Check service limits
- Invalid password policy → Review HIPAA requirements
- Email sending failed → Configure SES (production)

**Post-deployment:**
- Configure email templates
- Set up custom domain (optional)
- Enable advanced security features
- Configure Lambda triggers

---

### Step 8: Deploy Monitoring (CloudWatch, CloudTrail, GuardDuty)

**What happens:**
- Creates CloudWatch Log Groups for all services
- Sets up CloudWatch Alarms for critical metrics
- Creates CloudWatch Dashboard
- Enables CloudTrail for API call logging
- Activates GuardDuty for threat detection
- Configures SNS topics for alerts
- Sets up metric filters and alarms

**Resources created:**
- 10+ CloudWatch Log Groups
- 15+ CloudWatch Alarms
- 1 CloudWatch Dashboard
- 1 CloudTrail trail
- 1 GuardDuty detector
- 2 SNS Topics (critical, warning)
- 1 S3 Bucket (for CloudTrail logs)

**CloudWatch Alarms:**
1. Lambda error rate > 5%
2. Lambda throttles > 10
3. Aurora CPU > 80%
4. Aurora connections > 80% of max
5. API Gateway 5xx errors > 1%
6. AppSync error rate > 5%
7. S3 4xx errors (access denied)
8. GuardDuty findings (high severity)

**CloudTrail Configuration:**
```hcl
enable_logging                = true
include_global_service_events = true
is_multi_region_trail        = true
enable_log_file_validation   = true

event_selector {
  read_write_type           = "All"
  include_management_events = true
  
  data_resource {
    type   = "AWS::S3::Object"
    values = ["${documents_bucket_arn}/*"]
  }
}
```

**GuardDuty:**
- Threat detection across account
- Monitors CloudTrail, VPC Flow Logs, DNS logs
- Automated findings for suspicious activity

**Time:** 4-5 minutes

**Outputs:**
- CloudWatch Dashboard URL
- SNS Topic ARNs
- CloudTrail S3 bucket name

**Costs:**
- CloudWatch Logs: $0.50/GB ingested
- CloudWatch Alarms: $0.10 per alarm per month
- CloudTrail: $2.00 per 100,000 events
- GuardDuty: $4.50 per million CloudTrail events

**Potential Issues:**
- SNS topic creation failed → Check service limits
- CloudTrail already enabled → Check existing trails
- GuardDuty already enabled → Use existing detector

---

### Step 9: Build and Deploy Lambda Services

**What happens:**
- Compiles TypeScript to JavaScript for all services
- Bundles dependencies for each Lambda function
- Creates Lambda functions for each service
- Configures VPC access (private subnets)
- Sets environment variables
- Creates IAM roles and policies
- Sets up Lambda layers (shared dependencies)
- Configures reserved concurrency (if needed)

**Services deployed:**

#### 1. Auth Service
**Functions:**
- `authService-dev-register` - User registration
- `authService-dev-login` - User authentication
- `authService-dev-refreshToken` - Token refresh
- `authService-dev-changePassword` - Password management
- `authService-dev-forgotPassword` - Password reset

**Environment Variables:**
- USER_POOL_ID
- STAFF_CLIENT_ID
- PATIENT_CLIENT_ID
- GUARDIAN_CLIENT_ID
- JWT_SECRET

#### 2. Patient Service
**Functions:**
- `patientService-dev-createPatient`
- `patientService-dev-getPatient`
- `patientService-dev-updatePatient`
- `patientService-dev-deletePatient`
- `patientService-dev-listPatients`
- `patientService-dev-searchPatients`

**Environment Variables:**
- DB_ENDPOINT
- DB_SECRET_ARN
- KMS_KEY_ID

#### 3. Appointment Service
**Functions:**
- `appointmentService-dev-createAppointment`
- `appointmentService-dev-getAppointment`
- `appointmentService-dev-updateAppointment`
- `appointmentService-dev-cancelAppointment`
- `appointmentService-dev-listAppointments`

#### 4. Medical Records Service
**Functions:**
- `medicalRecordsService-dev-createRecord`
- `medicalRecordsService-dev-getRecord`
- `medicalRecordsService-dev-updateRecord`
- `medicalRecordsService-dev-uploadDocument`
- `medicalRecordsService-dev-listRecords`

**Environment Variables:**
- DOCUMENTS_BUCKET
- KMS_KEY_ID

**Lambda Configuration:**
```yaml
functions:
  createPatient:
    handler: dist/handlers/createPatient.handler
    timeout: 30
    memorySize: 1024
    vpc:
      securityGroupIds:
        - ${param:lambdaSecurityGroupId}
      subnetIds: ${param:privateSubnetIds}
    environment:
      DB_ENDPOINT: ${param:dbEndpoint}
      DB_SECRET_ARN: ${param:dbSecretArn}
      KMS_KEY_ID: ${param:kmsKeyId}
    iamRoleStatements:
      - Effect: Allow
        Action:
          - rds-data:ExecuteStatement
          - secretsmanager:GetSecretValue
          - kms:Decrypt
        Resource: "*"
```

**Build process:**
```bash
# For each service
npm run build  # Compiles TypeScript
serverless package  # Creates deployment package
serverless deploy  # Uploads and deploys
```

**Time:** 10-15 minutes (all services)

**Potential Issues:**
- Build failed → Check TypeScript errors
- Deployment timeout → Check VPC/subnet configuration
- Permission denied → Verify IAM roles
- Cold start issues → Consider provisioned concurrency

**Verification:**
```bash
# List deployed functions
aws lambda list-functions --region us-east-1 | jq '.Functions[] | select(.FunctionName | contains("healthcare"))'

# Invoke a function manually
aws lambda invoke \
  --function-name patientService-dev-listPatients \
  --region us-east-1 \
  response.json

cat response.json
```

---

### Step 10: Deploy AWS AppSync GraphQL API

**What happens:**
- Creates AppSync GraphQL API
- Uploads GraphQL schema
- Configures Cognito authentication
- Creates data sources (Lambda functions)
- Creates resolvers (connects queries/mutations to Lambda)
- Sets up caching (optional)
- Configures logging to CloudWatch

**Resources created:**
- 1 AppSync API
- 1 GraphQL Schema
- 4+ Data Sources (Lambda)
- 30+ Resolvers
- 1 API Key (dev only)
- CloudWatch Log Group

**GraphQL Schema highlights:**
```graphql
type Query {
  # Auth
  me: User! @auth
  
  # Patients
  getPatient(id: ID!): Patient @auth(requires: [ADMIN, PROVIDER, PATIENT])
  listPatients(limit: Int, nextToken: String): PatientsConnection @auth(requires: [ADMIN, PROVIDER])
  searchPatients(query: String!): [Patient!]! @auth(requires: [ADMIN, PROVIDER])
  
  # Appointments
  getAppointment(id: ID!): Appointment @auth
  listAppointments(patientId: ID, providerId: ID): [Appointment!]! @auth
  
  # Medical Records
  getMedicalRecord(id: ID!): MedicalRecord @auth
  listMedicalRecords(patientId: ID!): [MedicalRecord!]! @auth
}

type Mutation {
  # Auth
  login(input: LoginInput!): AuthPayload!
  register(input: RegisterInput!): AuthPayload!
  refreshToken(token: String!): AuthPayload!
  
  # Patients
  createPatient(input: CreatePatientInput!): Patient! @auth(requires: [ADMIN, RECEPTIONIST])
  updatePatient(id: ID!, input: UpdatePatientInput!): Patient! @auth
  deletePatient(id: ID!): Boolean! @auth(requires: [ADMIN])
  
  # Appointments
  createAppointment(input: CreateAppointmentInput!): Appointment! @auth
  updateAppointmentStatus(id: ID!, status: AppointmentStatus!): Appointment! @auth
  
  # Medical Records
  createMedicalRecord(input: CreateMedicalRecordInput!): MedicalRecord! @auth(requires: [PROVIDER])
  uploadDocument(input: UploadDocumentInput!): DocumentUploadUrl! @auth
}
```

**Data Source Configuration:**
Each Lambda function is configured as a data source:
```yaml
dataSources:
  - type: AWS_LAMBDA
    name: authServiceDataSource
    config:
      functionName: authService-${self:provider.stage}-login
      serviceRoleArn: !GetAtt AppSyncServiceRole.Arn
```

**Resolver Configuration:**
```yaml
resolvers:
  Query:
    - field: getPatient
      dataSource: patientServiceDataSource
      request: getPatient.req.vtl
      response: common.res.vtl
```

**Authentication:**
```yaml
authenticationType: AMAZON_COGNITO_USER_POOLS
userPoolConfig:
  defaultAction: ALLOW
  userPoolId: ${param:userPoolId}
  awsRegion: ${self:provider.region}
```

**Time:** 5-7 minutes

**Outputs exported:**
- `APPSYNC_ENDPOINT`: GraphQL API URL
- `APPSYNC_API_KEY`: API Key (dev only)

**Costs:**
- Query/mutation: $4.00 per million requests
- Real-time updates: $2.00 per million minutes

**Verification:**
```bash
# Get API details
aws appsync list-graphql-apis --region us-east-1

# Test query (requires authentication)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"query":"query { me { id email role } }"}' \
  ${APPSYNC_ENDPOINT}
```

**Potential Issues:**
- Schema upload failed → Check GraphQL syntax
- Resolver creation failed → Verify Lambda ARNs
- Authentication failed → Check Cognito configuration
- VTL template error → Review mapping templates

---

## Post-Deployment Configuration

### Step 1: Create Initial Admin User

```bash
# Create admin user in Cognito
aws cognito-idp admin-create-user \
  --user-pool-id ${USER_POOL_ID} \
  --username admin@healthcare.com \
  --user-attributes \
    Name=email,Value=admin@healthcare.com \
    Name=custom:role,Value=ADMIN \
    Name=custom:userType,Value=STAFF \
  --temporary-password "TempPassword123!@#" \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id ${USER_POOL_ID} \
  --username admin@healthcare.com \
  --password "SecurePassword123!@#" \
  --permanent
```

### Step 2: Configure Frontend Application

Create `.env` file in your frontend application:

```bash
# .env.production
REACT_APP_GRAPHQL_ENDPOINT=${APPSYNC_ENDPOINT}
REACT_APP_AWS_REGION=${AWS_REGION}
REACT_APP_USER_POOL_ID=${USER_POOL_ID}
REACT_APP_STAFF_CLIENT_ID=${STAFF_CLIENT_ID}
REACT_APP_PATIENT_CLIENT_ID=${PATIENT_CLIENT_ID}
REACT_APP_GUARDIAN_CLIENT_ID=${GUARDIAN_CLIENT_ID}
```

### Step 3: Set Up CloudWatch Alarms SNS Subscriptions

```bash
# Subscribe to critical alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:healthcare-critical-alerts \
  --protocol email \
  --notification-endpoint ops-team@healthcare.com

# Confirm email subscriptions
# Check your email and click the confirmation link
```

### Step 4: Configure SSL/TLS Certificates (Production)

```bash
# Request certificate in ACM
aws acm request-certificate \
  --domain-name api.healthcare.com \
  --validation-method DNS \
  --region us-east-1

# Get certificate ARN
CERTIFICATE_ARN=$(aws acm list-certificates --region us-east-1 --query 'CertificateSummaryList[0].CertificateArn' --output text)

# Configure custom domain in AppSync
aws appsync create-domain-name \
  --domain-name api.healthcare.com \
  --certificate-arn ${CERTIFICATE_ARN}
```

### Step 5: Enable GuardDuty Notifications

```bash
# Create EventBridge rule for GuardDuty findings
aws events put-rule \
  --name healthcare-guardduty-findings \
  --event-pattern '{
    "source": ["aws.guardduty"],
    "detail-type": ["GuardDuty Finding"],
    "detail": {
      "severity": [7, 8, 9]
    }
  }'

# Add SNS target
aws events put-targets \
  --rule healthcare-guardduty-findings \
  --targets "Id"="1","Arn"="arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:healthcare-critical-alerts"
```

### Step 6: Configure Backup and Disaster Recovery

```bash
# Enable automated backups for Aurora
aws rds modify-db-cluster \
  --db-cluster-identifier healthcare-system-dev \
  --backup-retention-period 35 \
  --preferred-backup-window "03:00-04:00" \
  --apply-immediately

# Create AWS Backup plan
aws backup create-backup-plan \
  --backup-plan '{
    "BackupPlanName": "healthcare-daily-backup",
    "Rules": [{
      "RuleName": "DailyBackups",
      "TargetBackupVaultName": "Default",
      "ScheduleExpression": "cron(0 5 ? * * *)",
      "StartWindowMinutes": 60,
      "CompletionWindowMinutes": 120,
      "Lifecycle": {
        "DeleteAfterDays": 35
      }
    }]
  }'
```

### Step 7: Set Up CloudWatch Insights Queries

Save these queries in CloudWatch Insights for easy debugging:

**Query 1: Failed Authentication Attempts**
```
fields @timestamp, @message
| filter @message like /authentication failed/
| stats count() by userEmail
| sort count desc
```

**Query 2: PHI Access Audit**
```
fields @timestamp, userId, action, resourceId
| filter phiAccessed = true
| sort @timestamp desc
```

**Query 3: API Error Rate**
```
fields @timestamp, errorMessage, functionName
| filter level = "ERROR"
| stats count() by errorMessage, functionName
```

### Step 8: Configure CORS for Frontend

Update AppSync CORS settings:

```bash
# Update serverless.yml for AppSync
appSync:
  cors:
    allowedOrigins:
      - https://app.healthcare.com
      - https://dev.healthcare.com
    allowedHeaders:
      - Content-Type
      - Authorization
      - X-Api-Key
    allowedMethods:
      - GET
      - POST
      - PUT
      - DELETE
    maxAge: 3600
```

---

## Verification and Testing

### Step 1: Health Check Endpoints

Test each service to ensure it's responding:

```bash
# Test Auth Service
aws lambda invoke \
  --function-name authService-dev-health \
  --region us-east-1 \
  response.json

# Test Patient Service
aws lambda invoke \
  --function-name patientService-dev-health \
  --region us-east-1 \
  response.json
```

### Step 2: Database Connectivity Test

```bash
# Connect to Aurora from Lambda
aws lambda invoke \
  --function-name testDbConnection-dev \
  --payload '{"action": "testConnection"}' \
  --region us-east-1 \
  response.json

cat response.json
# Expected: {"status": "connected", "tables": [...]}
```

### Step 3: Authentication Flow Test

```graphql
# 1. Register a test user
mutation Register {
  register(input: {
    email: "test.patient@example.com"
    password: "TestPassword123!@#"
    firstName: "Test"
    lastName: "Patient"
    role: PATIENT
    userType: PATIENT
  }) {
    accessToken
    refreshToken
    user {
      id
      email
      role
    }
  }
}

# 2. Login
mutation Login {
  login(input: {
    email: "test.patient@example.com"
    password: "TestPassword123!@#"
  }) {
    accessToken
    refreshToken
    user {
      id
      email
    }
  }
}

# 3. Get current user
query Me {
  me {
    id
    email
    role
    firstName
    lastName
  }
}
```

### Step 4: Patient CRUD Operations Test

```graphql
# Create patient
mutation CreatePatient {
  createPatient(input: {
    demographics: {
      firstName: "John"
      lastName: "Doe"
      dateOfBirth: "1990-01-01"
      gender: MALE
      ssn: "123-45-6789"
      phoneNumber: "+1234567890"
      email: "john.doe@example.com"
      address: {
        street: "123 Main St"
        city: "Boston"
        state: "MA"
        zipCode: "02101"
        country: "USA"
      }
    }
  }) {
    id
    mrn
    demographics {
      firstName
      lastName
    }
  }
}

# Get patient
query GetPatient {
  getPatient(id: "patient-uuid") {
    id
    mrn
    demographics {
      firstName
      lastName
      dateOfBirth
    }
    medicalHistory {
      allergies
      chronicConditions
    }
  }
}

# List patients
query ListPatients {
  listPatients(limit: 10) {
    items {
      id
      mrn
      demographics {
        firstName
        lastName
      }
    }
    nextToken
  }
}
```

### Step 5: Appointment Scheduling Test

```graphql
mutation CreateAppointment {
  createAppointment(input: {
    patientId: "patient-uuid"
    providerId: "provider-uuid"
    appointmentDate: "2024-12-15T10:00:00Z"
    duration: 30
    appointmentType: CONSULTATION
    reason: "Annual checkup"
  }) {
    id
    appointmentDate
    status
    patient {
      id
      demographics {
        firstName
        lastName
      }
    }
  }
}
```

### Step 6: Document Upload Test

```graphql
# Get pre-signed URL for upload
mutation GetUploadUrl {
  uploadDocument(input: {
    patientId: "patient-uuid"
    fileName: "lab-results.pdf"
    fileType: "application/pdf"
    recordType: LAB_RESULT
  }) {
    uploadUrl
    documentId
    expiresAt
  }
}

# Upload file using the pre-signed URL (using curl)
# curl -X PUT -T lab-results.pdf "${uploadUrl}"
```

### Step 7: Audit Log Verification

Check that all actions are being logged:

```sql
-- Connect to Aurora
psql -h ${DB_ENDPOINT} -U dbadmin -d healthcare

-- Query recent audit logs
SELECT 
  timestamp,
  user_id,
  action,
  resource,
  phi_accessed,
  ip_address
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 20;

-- Check PHI access logs
SELECT 
  user_id,
  COUNT(*) as access_count,
  MAX(timestamp) as last_access
FROM audit_logs
WHERE phi_accessed = true
GROUP BY user_id;
```

### Step 8: Performance Testing

Run load tests using Artillery:

```bash
# Install Artillery
npm install -g artillery

# Create test configuration
cat > load-test.yml <<EOF
config:
  target: "${APPSYNC_ENDPOINT}"
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 300
      arrivalRate: 50
      name: Sustained load
  processor: "./test-functions.js"

scenarios:
  - name: "Patient operations"
    flow:
      - post:
          url: "/"
          headers:
            Authorization: "Bearer {{ \$processEnvironment.ACCESS_TOKEN }}"
            Content-Type: "application/json"
          json:
            query: |
              query {
                listPatients(limit: 10) {
                  items { id mrn }
                }
              }
EOF

# Run load test
ACCESS_TOKEN="your-jwt-token" artillery run load-test.yml
```

### Step 9: Security Scanning

```bash
# Check for public S3 buckets
aws s3api get-bucket-acl --bucket ${DOCUMENTS_BUCKET}

# Verify encryption
aws s3api get-bucket-encryption --bucket ${DOCUMENTS_BUCKET}

# Check security groups
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=healthcare*" \
  --query 'SecurityGroups[*].[GroupId,GroupName,IpPermissions]'

# Verify Aurora encryption
aws rds describe-db-clusters \
  --db-cluster-identifier healthcare-system-dev \
  --query 'DBClusters[0].StorageEncrypted'
```

### Step 10: CloudWatch Dashboard Check

```bash
# Open CloudWatch dashboard
aws cloudwatch get-dashboard \
  --dashboard-name healthcare-system-dev-dashboard \
  --region us-east-1

# Check recent alarms
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --region us-east-1
```

---

## Troubleshooting

### Issue 1: Lambda Timeout in VPC

**Symptoms:**
- Lambda functions timing out
- "Task timed out after X seconds" errors

**Causes:**
- No internet access from private subnets
- Missing NAT Gateway
- Security group blocking outbound traffic

**Solutions:**

```bash
# Check NAT Gateway status
aws ec2 describe-nat-gateways \
  --filter "Name=vpc-id,Values=${VPC_ID}" \
  --query 'NatGateways[*].[NatGatewayId,State]'

# Verify route table has NAT Gateway route
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query 'RouteTables[*].Routes'

# Check security group outbound rules
aws ec2 describe-security-groups \
  --group-ids ${LAMBDA_SECURITY_GROUP_ID} \
  --query 'SecurityGroups[*].IpPermissionsEgress'

# Fix: Ensure NAT Gateway exists and routes are correct
terraform apply -target=module.networking.aws_nat_gateway.main
```

### Issue 2: Aurora Connection Refused

**Symptoms:**
- "Connection refused" errors from Lambda
- "Could not connect to database" errors

**Causes:**
- Incorrect security group rules
- Lambda not in correct subnets
- Database endpoint incorrect

**Solutions:**

```bash
# Check Aurora security group
aws rds describe-db-clusters \
  --db-cluster-identifier healthcare-system-dev \
  --query 'DBClusters[0].VpcSecurityGroups'

# Verify security group allows Lambda
aws ec2 describe-security-groups \
  --group-ids ${DB_SECURITY_GROUP_ID} \
  --query 'SecurityGroups[*].IpPermissions'

# Fix: Add Lambda security group to Aurora security group
aws ec2 authorize-security-group-ingress \
  --group-id ${DB_SECURITY_GROUP_ID} \
  --protocol tcp \
  --port 5432 \
  --source-group ${LAMBDA_SECURITY_GROUP_ID}

# Test connection from Lambda
aws lambda invoke \
  --function-name testDbConnection-dev \
  --log-type Tail \
  response.json
```

### Issue 3: Cognito Authentication Failed

**Symptoms:**
- "User does not exist" errors
- "Invalid client ID" errors
- JWT validation failures

**Causes:**
- Wrong client ID used for user type
- User not confirmed in Cognito
- Token expired

**Solutions:**

```bash
# List all users
aws cognito-idp list-users \
  --user-pool-id ${USER_POOL_ID}

# Check user status
aws cognito-idp admin-get-user \
  --user-pool-id ${USER_POOL_ID} \
  --username user@example.com

# Confirm user manually
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id ${USER_POOL_ID} \
  --username user@example.com

# Verify correct client ID mapping
echo "Staff Client: ${STAFF_CLIENT_ID}"
echo "Patient Client: ${PATIENT_CLIENT_ID}"
echo "Guardian Client: ${GUARDIAN_CLIENT_ID}"
```

### Issue 4: S3 Access Denied

**Symptoms:**
- "Access Denied" when uploading documents
- "Forbidden" errors

**Causes:**
- Missing IAM permissions
- Bucket policy blocking access
- KMS key policy issues

**Solutions:**

```bash
# Check bucket policy
aws s3api get-bucket-policy \
  --bucket ${DOCUMENTS_BUCKET}

# Verify Lambda role has S3 permissions
aws iam get-role-policy \
  --role-name medicalRecordsService-dev-lambda-role \
  --policy-name s3-access

# Check KMS key policy
aws kms get-key-policy \
  --key-id ${KMS_KEY_ID} \
  --policy-name default

# Fix: Update Lambda role policy
aws iam put-role-policy \
  --role-name medicalRecordsService-dev-lambda-role \
  --policy-name s3-access \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${DOCUMENTS_BUCKET}/*"
    }]
  }'
```

### Issue 5: High Aurora Costs

**Symptoms:**
- Unexpected high AWS bills
- Aurora ACUs consistently at maximum

**Causes:**
- Database not scaling down
- Long-running queries
- Connection leaks

**Solutions:**

```bash
# Check current ACU usage
aws rds describe-db-clusters \
  --db-cluster-identifier healthcare-system-dev \
  --query 'DBClusters[0].ServerlessV2ScalingConfiguration'

# View CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ServerlessDatabaseCapacity \
  --dimensions Name=DBClusterIdentifier,Value=healthcare-system-dev \
  --start-time 2024-11-01T00:00:00Z \
  --end-time 2024-11-07T23:59:59Z \
  --period 3600 \
  --statistics Average

# Check for long-running queries
psql -h ${DB_ENDPOINT} -U dbadmin -d healthcare -c "
SELECT 
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;
"

# Fix: Adjust scaling configuration
aws rds modify-db-cluster \
  --db-cluster-identifier healthcare-system-dev \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0
```

### Issue 6: CloudWatch Log Retention Issues

**Symptoms:**
- Logs missing after certain period
- Storage costs higher than expected

**Solutions:**

```bash
# Check current retention settings
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/healthcare" \
  --query 'logGroups[*].[logGroupName,retentionInDays]'

# Set retention to 7 years (HIPAA requirement)
for log_group in $(aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/healthcare" --query 'logGroups[*].logGroupName' --output text); do
  aws logs put-retention-policy \
    --log-group-name $log_group \
    --retention-in-days 2557  # 7 years
done
```

### Issue 7: AppSync Resolver Errors

**Symptoms:**
- GraphQL queries returning null
- "Pipeline resolver error" messages

**Causes:**
- VTL template syntax errors
- Lambda response format incorrect
- Data source misconfigured

**Solutions:**

```bash
# Enable detailed logging
aws appsync update-graphql-api \
  --api-id ${APPSYNC_API_ID} \
  --log-config '{
    "fieldLogLevel": "ALL",
    "cloudWatchLogsRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AppSyncLogsRole"
  }'

# Check resolver logs
aws logs filter-log-events \
  --log-group-name /aws/appsync/apis/${APPSYNC_API_ID} \
  --filter-pattern "ERROR"

# Test resolver directly
aws appsync evaluate-mapping-template \
  --template-file resolver-request.vtl \
  --context-file test-context.json
```

### Issue 8: Terraform State Lock

**Symptoms:**
- "Error locking state" messages
- Cannot run terraform commands

**Solutions:**

```bash
# Check DynamoDB lock table
aws dynamodb scan \
  --table-name healthcare-terraform-locks

# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>

# Or delete the lock item manually
aws dynamodb delete-item \
  --table-name healthcare-terraform-locks \
  --key '{"LockID": {"S": "healthcare-system-dev/terraform.tfstate"}}'
```

---

## Rollback Procedures

### Emergency Rollback - Complete Stack

```bash
# Stop all incoming traffic first
aws appsync update-graphql-api \
  --api-id ${APPSYNC_API_ID} \
  --name healthcare-system-api-maintenance

# Backup current database
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier healthcare-rollback-$(date +%Y%m%d-%H%M%S) \
  --db-cluster-identifier healthcare-system-dev

# Remove Lambda functions
cd services
serverless remove --stage dev --region us-east-1

# Remove AppSync
cd graphql-api
serverless remove --stage dev --region us-east-1

# Destroy Terraform resources (except data stores)
cd infrastructure/terraform
terraform destroy \
  -target=module.monitoring \
  -target=module.cognito \
  -auto-approve

# DO NOT destroy database and S3 without backup confirmation
```

### Partial Rollback - Lambda Services Only

```bash
# Deploy previous version
cd services/patient-service
serverless deploy --stage dev --region us-east-1 --version 1.2.3

# Or rollback specific function
aws lambda update-function-code \
  --function-name patientService-dev-createPatient \
  --s3-bucket my-deployment-bucket \
  --s3-key deployments/v1.2.3/patient-service.zip
```

### Database Rollback

```bash
# List available snapshots
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier healthcare-system-dev

# Restore from snapshot
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier healthcare-system-dev-restored \
  --snapshot-identifier healthcare-rollback-20241107-120000 \
  --engine aurora-postgresql \
  --engine-version 15.4

# Update Lambda environment variables to point to restored cluster
```

---

## Production Deployment Checklist

Before deploying to production, ensure:

### Security
- [ ] MFA enabled for all administrative accounts
- [ ] SSL/TLS certificates configured
- [ ] API keys rotated
- [ ] Secrets Manager secrets created
- [ ] KMS keys configured with proper policies
- [ ] Security groups reviewed and minimized
- [ ] CloudTrail enabled in all regions
- [ ] GuardDuty enabled
- [ ] WAF configured (if using CloudFront)
- [ ] Penetration testing completed

### Compliance
- [ ] HIPAA Business Associate Agreement signed with AWS
- [ ] Encryption at rest enabled for all data stores
- [ ] Encryption in transit enforced (TLS 1.2+)
- [ ] Audit logging configured (7-year retention)
- [ ] Access controls implemented and tested
- [ ] Data backup and retention policies configured
- [ ] Disaster recovery plan documented and tested
- [ ] Incident response procedures documented

### Performance
- [ ] Load testing completed
- [ ] Database indexes optimized
- [ ] Lambda memory sizes tuned
- [ ] CloudFront CDN configured (for frontend)
- [ ] AppSync caching enabled
- [ ] Auto-scaling configured for Lambda
- [ ] Database scaling limits appropriate

### Monitoring
- [ ] CloudWatch dashboards created
- [ ] Critical alarms configured
- [ ] SNS notifications set up
- [ ] Log aggregation configured
- [ ] Metric retention policies set
- [ ] On-call rotation established

### Operations
- [ ] Runbooks documented
- [ ] Backup procedures tested
- [ ] Disaster recovery tested
- [ ] Rollback procedures documented
- [ ] Team trained on operations
- [ ] Support contacts documented

### Documentation
- [ ] Architecture diagrams updated
- [ ] API documentation published
- [ ] User guides created
- [ ] Admin guides created
- [ ] Compliance documentation complete

---

## Maintenance Procedures

### Daily Tasks
- Review CloudWatch alarms
- Check GuardDuty findings
- Monitor error rates
- Review audit logs for suspicious activity

### Weekly Tasks
- Review and rotate API keys
- Analyze cost reports
- Review backup success rates
- Update security patches
- Review access logs

### Monthly Tasks
- Conduct security audit
- Review and update IAM policies
- Test disaster recovery procedures
- Review and optimize costs
- Update documentation
- Review compliance requirements

### Quarterly Tasks
- Conduct penetration testing
- Review architecture for improvements
- Update business continuity plan
- Train team on new features
- Review vendor agreements

---

## Cost Optimization Tips

1. **Right-size Aurora**: Monitor ACU usage and adjust min/max capacity
2. **Use S3 Lifecycle Policies**: Move old documents to Glacier
3. **Optimize Lambda Memory**: Profile functions and adjust memory
4. **Enable AppSync Caching**: Reduce Lambda invocations
5. **Use Reserved Capacity**: For predictable workloads (production)
6. **Delete Unused Resources**: Regular cleanup of old snapshots, logs
7. **Monitor Data Transfer**: Use VPC endpoints to reduce costs
8. **Optimize CloudWatch Logs**: Set appropriate retention periods

---

## Support and Resources

### AWS Support
- Support Plan: Business or Enterprise (recommended)
- TAM: Technical Account Manager (Enterprise plan)
- Support Portal: https://console.aws.amazon.com/support/

### Documentation
- AWS Documentation: https://docs.aws.amazon.com/
- Serverless Framework: https://www.serverless.com/framework/docs/
- Terraform AWS Provider: https://registry.terraform.io/providers/hashicorp/aws/

### Community
- AWS Forums: https://forums.aws.amazon.com/
- Stack Overflow: Tag with [aws], [terraform], [serverless]
- GitHub Issues: Project repository issues

### Emergency Contacts
- Team Lead: [contact info]
- DevOps Engineer: [contact info]
- Security Officer: [contact info]
- AWS Support: 1-800-xxx-xxxx (24/7)

---

## Appendix

### A. Environment Variable Reference

Complete list of all environment variables used:

**Deployment Script:**
- `AWS_REGION`: Target AWS region
- `AWS_PROFILE`: AWS CLI profile name
- `ENVIRONMENT`: Deployment environment (dev/staging/prod)
- `PROJECT_NAME`: Project identifier

**Lambda Functions:**
- `DB_ENDPOINT`: Aurora endpoint
- `DB_SECRET_ARN`: Secrets Manager ARN for DB credentials
- `USER_POOL_ID`: Cognito User Pool ID
- `STAFF_CLIENT_ID`: Cognito App Client ID for staff
- `PATIENT_CLIENT_ID`: Cognito App Client ID for patients
- `GUARDIAN_CLIENT_ID`: Cognito App Client ID for guardians
- `DOCUMENTS_BUCKET`: S3 bucket for documents
- `KMS_KEY_ID`: KMS key for encryption
- `LOG_LEVEL`: Logging level (debug/info/warn/error)
- `NODE_ENV`: Node environment (development/production)

### B. AWS Resource Naming Conventions

All resources follow this pattern:
```
{project-name}-{resource-type}-{environment}

Examples:
- healthcare-system-vpc-dev
- healthcare-system-database-prod
- healthcare-system-documents-staging
```

### C. Estimated Deployment Times

| Step | Development | Production |
|------|-------------|------------|
| Prerequisites Check | 30s | 30s |
| Terraform Init | 1-2min | 1-2min |
| VPC Deployment | 3-5min | 5-8min |
| Aurora Deployment | 8-12min | 15-20min |
| Database Migrations | 2-3min | 3-5min |
| S3 Deployment | 2-3min | 2-3min |
| Cognito Deployment | 3-4min | 4-5min |
| Monitoring Deployment | 4-5min | 5-7min |
| Lambda Services | 10-15min | 15-20min |
| AppSync Deployment | 5-7min | 7-10min |
| **Total** | **40-60min** | **60-90min** |

---

**Version:** 1.0.0  
**Last Updated:** November 7, 2024  
**Maintained By:** DevOps Team-endpoint ops-team@healthcare.com

# Subscribe to warning alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:healthcare-warning-alerts \
  --protocol email \
  --notification