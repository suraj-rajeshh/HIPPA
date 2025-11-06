# HIPAA-Compliant Healthcare System - AWS Serverless

Complete healthcare management system built with AWS serverless technologies, GraphQL, and HIPAA compliance.

## 🏗️ Architecture

- **Backend**: AWS Lambda (Node.js)
- **API**: AWS AppSync (GraphQL)
- **Database**: Aurora Serverless v2 (PostgreSQL)
- **Auth**: AWS Cognito
- **Storage**: AWS S3 (encrypted)
- **Monitoring**: CloudTrail, GuardDuty, CloudWatch

## 📋 Prerequisites

- Node.js 18+
- AWS CLI configured
- Terraform 1.0+
- Serverless Framework
- AWS Account with appropriate permissions

## 🚀 Quick Start

### 1. Clone and Install

\`\`\`bash
git clone 
cd healthcare-aws-serverless
npm install
\`\`\`

### 2. Configure Environment

\`\`\`bash
cp .env.example .env
# Edit .env with your AWS account details
\`\`\`

### 3. Deploy Infrastructure

\`\`\`bash
# Deploy to dev environment
./scripts/deploy.sh dev

# Or deploy to production
./scripts/deploy.sh prod
\`\`\`

### 4. Initialize Database

\`\`\`bash
npm run init:db -- --env=dev
\`\`\`

### 5. Seed Test Data (Optional)

\`\`\`bash
npm run seed -- --env=dev
\`\`\`

## 📚 API Documentation

### GraphQL Endpoint

After deployment, get your GraphQL endpoint:

\`\`\`bash
serverless info --stage dev
\`\`\`

### Example Queries

#### Register User

\`\`\`graphql
mutation Register {
  register(input: {
    email: "patient@example.com"
    password: "SecurePass123!@#"
    firstName: "John"
    lastName: "Doe"
    role: PATIENT
    userType: CLIENT
    consentGiven: true
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
\`\`\`

#### Login

\`\`\`graphql
mutation Login {
  login(input: {
    email: "patient@example.com"
    password: "SecurePass123!@#"
  }) {
    accessToken
    refreshToken
    user {
      id
      email
      firstName
      lastName
    }
  }
}
\`\`\`

#### Create Patient Record

\`\`\`graphql
mutation CreatePatient {
  createPatient(input: {
    userId: "user-uuid"
    demographics: {
      ssn: "123-45-6789"
      address: {
        street: "123 Main St"
        city: "Boston"
        state: "MA"
        zipCode: "02101"
        country: "US"
      }
      emergencyContact: {
        name: "Jane Doe"
        relationship: "Spouse"
        phone: "+1234567890"
      }
    }
    insurance: {
      provider: "Blue Cross"
      policyNumber: "POL123456"
      groupNumber: "GRP001"
    }
  }) {
    id
    mrn
    demographics {
      address {
        city
        state
      }
    }
  }
}
\`\`\`

#### List Appointments

\`\`\`graphql
query ListAppointments {
  listAppointments(
    filter: {
      status: SCHEDULED
    }
    limit: 10
  ) {
    items {
      id
      appointmentDate
      type
      status
      reason
      provider {
        firstName
        lastName
      }
    }
  }
}
\`\`\`

#### Create Medical Record

\`\`\`graphql
mutation CreateMedicalRecord {
  createMedicalRecord(input: {
    patientId: "patient-uuid"
    providerId: "provider-uuid"
    recordType: DIAGNOSIS
    date: "2024-01-15"
    title: "Hypertension Diagnosis"
    content: "Patient diagnosed with Stage 1 Hypertension..."
    icd10Codes: ["I10"]
    medications: ["Lisinopril 10mg"]
  }) {
    id
    title
    recordType
    date
  }
}
\`\`\`

## 🔐 Security & HIPAA Compliance

### Encryption

- **At Rest**: All PHI encrypted using AWS KMS
- **In Transit**: TLS 1.2+ for all communications
- **Database**: Aurora encryption with KMS
- **S3**: Server-side encryption with KMS

### Audit Logging

All PHI access is logged in the `audit_logs` table:

\`\`\`sql
SELECT * FROM audit_logs 
WHERE phi_accessed = true 
ORDER BY timestamp DESC;
\`\`\`

### Access Control

- **Authentication**: AWS Cognito with MFA support
- **Authorization**: Role-based access control (RBAC)
- **Token Expiry**: Access tokens expire after 1 hour

### Monitoring

\`\`\`bash
# View CloudWatch logs
aws logs tail /aws/lambda/healthcare-auth-service-dev --follow

# Check CloudTrail events
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=PutObject

# GuardDuty findings
aws guardduty list-findings --detector-id 
\`\`\`

## 🧪 Testing

### Run Unit Tests

\`\`\`bash
npm test
\`\`\`

### Test GraphQL API

\`\`\`bash
# Install dependencies
npm install -g @apollo/rover

# Test queries
rover graph introspect 
\`\`\`

### Load Testing

\`\`\`bash
# Install artillery
npm install -g artillery

# Run load test
artillery run tests/load-test.yml
\`\`\`

## 📊 Monitoring & Analytics

### CloudWatch Dashboard

Access your dashboard:
\`\`\`
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=healthcare-dev
\`\`\`

### Key Metrics

- Lambda invocations and errors
- Aurora CPU and connections
- API Gateway latency
- S3 bucket metrics

### Alarms

Alarms are configured for:
- Lambda error rates > 5%
- Aurora CPU > 80%
- API Gateway 5xx errors
- GuardDuty findings

## 🗄️ Database Management

### Connect to Aurora

\`\`\`bash
# Get connection details
aws secretsmanager get-secret-value \
  --secret-id healthcare/aurora/dev/credentials \
  --query SecretString \
  --output text | jq -r

# Connect using psql
psql -h  -U healthcare_admin -d healthcare
\`\`\`

### Backup & Recovery

Aurora automated backups:
- Retention: 35 days
- Backup window: 3:00-4:00 AM UTC
- Point-in-time recovery enabled

### Database Migrations

\`\`\`bash
# Create new migration
npm run migration:create -- add_new_table

# Run migrations
npm run migration:run -- --env=dev
\`\`\`

## 📁 Project Structure

\`\`\`
healthcare-aws-serverless/
├── infrastructure/
│   └── terraform/           # Infrastructure as Code
├── packages/
│   ├── graphql/            # GraphQL schemas
│   ├── services/           # Lambda functions
│   │   ├── auth-service/
│   │   ├── patient-service/
│   │   ├── appointment-service/
│   │   └── medical-records-service/
│   └── shared/             # Shared utilities
│       ├── config/
│       ├── middleware/
│       ├── utils/
│       └── types/
├── scripts/                # Deployment & utility scripts
├── tests/                  # Test files
├── serverless.yml         # Serverless Framework config
└── package.json
\`\`\`

## 🔧 Configuration

### Environment Variables

\`\`\`bash
# AWS
AWS_REGION=us-east-1
STAGE=dev

# Database
AURORA_CLUSTER_ARN=
AURORA_SECRET_ARN=

# Auth
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

# Storage
S3_BUCKET=
ENCRYPTION_KEY_ID=
\`\`\`

### Terraform Variables

Edit `infrastructure/terraform/terraform.tfvars`:

\`\`\`hcl
aws_region = "us-east-1"
environment = "dev"
alert_email = "admin@example.com"
domain_name = "api.healthcare.example.com"
\`\`\`

## 🚨 Troubleshooting

### Common Issues

#### Lambda Timeout

\`\`\`bash
# Increase timeout in serverless.yml
functions:
  authService:
    timeout: 30
\`\`\`

#### Database Connection Issues

\`\`\`bash
# Check security groups
aws ec2 describe-security-groups --group-ids 

# Test connection
npm run test:db-connection
\`\`\`

#### GraphQL Errors

\`\`\`bash
# Enable detailed logging
serverless logs -f authService --tail

# Check AppSync logs
aws logs tail /aws/appsync/apis/ --follow
\`\`\`

### Debug Mode

Enable debug logging:

\`\`\`bash
export DEBUG=healthcare:*
npm run dev
\`\`\`

## 📝 Scripts Reference

\`\`\`bash
# Development
npm run dev                    # Start local development
npm run build                  # Build all packages
npm run test                   # Run tests
npm run lint                   # Lint code

# Deployment
npm run deploy:dev            # Deploy to dev
npm run deploy:prod           # Deploy to production
npm run remove:dev            # Remove dev stack

# Database
npm run init:db               # Initialize database
npm run seed                  # Seed test data
npm run migration:run         # Run migrations

# Monitoring
npm run logs:auth            # View auth service logs
npm run logs:patient         # View patient service logs
npm run metrics              # View CloudWatch metrics

# Terraform
npm run tf:init              # Initialize Terraform
npm run tf:plan              # Plan infrastructure changes
npm run tf:apply             # Apply infrastructure changes
npm run tf:destroy           # Destroy infrastructure
\`\`\`

## 🔄 CI/CD Pipeline

### GitHub Actions

\`\`\`.yaml
# .github/workflows/deploy.yml
name: Deploy Healthcare System

on:
  push:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
      
      - name: Deploy to AWS
        env:
          AWS_ACCESS_KEY_ID: \${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          if [[ \$GITHUB_REF == 'refs/heads/main' ]]; then
            ./scripts/deploy.sh prod
          else
            ./scripts/deploy.sh dev
          fi
\`\`\`