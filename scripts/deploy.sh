#!/bin/bash

# HIPAA-Compliant Healthcare System - AWS Deployment Script
# This script deploys all infrastructure and services to AWS

set -e  # Exit on error
set -u  # Exit on undefined variable

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-default}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
PROJECT_NAME="healthcare-system"

# Directory paths
TERRAFORM_DIR="./infrastructure/terraform"
SERVERLESS_DIR="./services"

# Stack names
NETWORK_STACK="${PROJECT_NAME}-network-${ENVIRONMENT}"
DATABASE_STACK="${PROJECT_NAME}-database-${ENVIRONMENT}"
STORAGE_STACK="${PROJECT_NAME}-storage-${ENVIRONMENT}"
COGNITO_STACK="${PROJECT_NAME}-cognito-${ENVIRONMENT}"
MONITORING_STACK="${PROJECT_NAME}-monitoring-${ENVIRONMENT}"

# Service names
AUTH_SERVICE="auth-service"
PATIENT_SERVICE="patient-service"
APPOINTMENT_SERVICE="appointment-service"
MEDICAL_RECORDS_SERVICE="medical-records-service"
APPSYNC_API="graphql-api"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${MAGENTA}[STEP]${NC} $1"
}

# Banner
print_banner() {
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   HIPAA-Compliant Healthcare System Deployment Script     ║"
    echo "║   Environment: $ENVIRONMENT"
    echo "║   Region: $AWS_REGION"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_step "1/10 - Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Install from: https://aws.amazon.com/cli/"
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Install from: https://www.terraform.io/"
        exit 1
    fi
    
    # Check Serverless Framework
    if ! command -v serverless &> /dev/null; then
        log_error "Serverless Framework is not installed. Run: npm install -g serverless"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Install from: https://nodejs.org/"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        log_error "AWS credentials not configured for profile: $AWS_PROFILE"
        exit 1
    fi
    
    # Get AWS Account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    log_info "AWS Account ID: $AWS_ACCOUNT_ID"
    
    log_success "Prerequisites check passed"
}

# Initialize Terraform
init_terraform() {
    log_step "2/10 - Initializing Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    terraform init \
        -backend-config="bucket=${PROJECT_NAME}-terraform-state-${AWS_ACCOUNT_ID}" \
        -backend-config="key=${ENVIRONMENT}/terraform.tfstate" \
        -backend-config="region=${AWS_REGION}" \
        -backend-config="profile=${AWS_PROFILE}"
    
    cd - > /dev/null
    log_success "Terraform initialized"
}

# Deploy VPC and Networking
deploy_network() {
    log_step "3/10 - Deploying VPC and Networking..."
    
    cd "$TERRAFORM_DIR/modules/networking"
    
    terraform apply \
        -var="environment=${ENVIRONMENT}" \
        -var="aws_region=${AWS_REGION}" \
        -var="project_name=${PROJECT_NAME}" \
        -auto-approve
    
    # Export VPC outputs
    export VPC_ID=$(terraform output -raw vpc_id)
    export PRIVATE_SUBNET_IDS=$(terraform output -json private_subnet_ids | jq -r '.[]' | tr '\n' ',')
    export PUBLIC_SUBNET_IDS=$(terraform output -json public_subnet_ids | jq -r '.[]' | tr '\n' ',')
    
    cd - > /dev/null
    log_success "Network infrastructure deployed"
    log_info "VPC ID: $VPC_ID"
}

# Deploy Aurora Database
deploy_database() {
    log_step "4/10 - Deploying Aurora Serverless v2 Database..."
    
    cd "$TERRAFORM_DIR/modules/database"
    
    terraform apply \
        -var="environment=${ENVIRONMENT}" \
        -var="vpc_id=${VPC_ID}" \
        -var="private_subnet_ids=${PRIVATE_SUBNET_IDS}" \
        -var="project_name=${PROJECT_NAME}" \
        -auto-approve
    
    # Export database outputs
    export DB_ENDPOINT=$(terraform output -raw db_endpoint)
    export DB_NAME=$(terraform output -raw db_name)
    export DB_SECRET_ARN=$(terraform output -raw db_secret_arn)
    
    cd - > /dev/null
    log_success "Database deployed"
    log_info "Database Endpoint: $DB_ENDPOINT"
    
    # Wait for database to be available
    log_info "Waiting for database to be fully available..."
    sleep 30
}

# Run database migrations
run_migrations() {
    log_step "5/10 - Running database migrations..."
    
    # Install dependencies if not already installed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install
    fi
    
    # Set environment variables for migration
    export DATABASE_URL="postgresql://${DB_ENDPOINT}/${DB_NAME}"
    export DB_SECRET_ARN="${DB_SECRET_ARN}"
    
    # Run migrations (adjust path based on your migration tool)
    npm run migrate:${ENVIRONMENT}
    
    log_success "Database migrations completed"
}

# Deploy S3 Storage
deploy_storage() {
    log_step "6/10 - Deploying S3 Storage with KMS encryption..."
    
    cd "$TERRAFORM_DIR/modules/storage"
    
    terraform apply \
        -var="environment=${ENVIRONMENT}" \
        -var="project_name=${PROJECT_NAME}" \
        -var="aws_region=${AWS_REGION}" \
        -auto-approve
    
    # Export storage outputs
    export DOCUMENTS_BUCKET=$(terraform output -raw documents_bucket_name)
    export KMS_KEY_ID=$(terraform output -raw kms_key_id)
    
    cd - > /dev/null
    log_success "Storage infrastructure deployed"
    log_info "Documents Bucket: $DOCUMENTS_BUCKET"
}

# Deploy Cognito
deploy_cognito() {
    log_step "7/10 - Deploying AWS Cognito User Pools..."
    
    cd "$TERRAFORM_DIR/modules/cognito"
    
    terraform apply \
        -var="environment=${ENVIRONMENT}" \
        -var="project_name=${PROJECT_NAME}" \
        -auto-approve
    
    # Export Cognito outputs
    export USER_POOL_ID=$(terraform output -raw user_pool_id)
    export STAFF_CLIENT_ID=$(terraform output -raw staff_client_id)
    export PATIENT_CLIENT_ID=$(terraform output -raw patient_client_id)
    export GUARDIAN_CLIENT_ID=$(terraform output -raw guardian_client_id)
    
    cd - > /dev/null
    log_success "Cognito deployed"
    log_info "User Pool ID: $USER_POOL_ID"
}

# Deploy monitoring and logging
deploy_monitoring() {
    log_step "8/10 - Deploying Monitoring, CloudWatch, and GuardDuty..."
    
    cd "$TERRAFORM_DIR/modules/monitoring"
    
    terraform apply \
        -var="environment=${ENVIRONMENT}" \
        -var="project_name=${PROJECT_NAME}" \
        -var="aws_region=${AWS_REGION}" \
        -auto-approve
    
    cd - > /dev/null
    log_success "Monitoring infrastructure deployed"
}

# Build and deploy Lambda services
deploy_lambda_services() {
    log_step "9/10 - Building and deploying Lambda services..."
    
    # Build TypeScript services
    log_info "Building TypeScript services..."
    npm run build
    
    # Deploy each service
    services=("$AUTH_SERVICE" "$PATIENT_SERVICE" "$APPOINTMENT_SERVICE" "$MEDICAL_RECORDS_SERVICE")
    
    for service in "${services[@]}"; do
        log_info "Deploying $service..."
        
        cd "$SERVERLESS_DIR/$service"
        
        # Install service dependencies
        npm install
        
        # Deploy with Serverless Framework
        serverless deploy \
            --stage "$ENVIRONMENT" \
            --region "$AWS_REGION" \
            --aws-profile "$AWS_PROFILE" \
            --param="vpcId=$VPC_ID" \
            --param="privateSubnetIds=$PRIVATE_SUBNET_IDS" \
            --param="dbEndpoint=$DB_ENDPOINT" \
            --param="dbSecretArn=$DB_SECRET_ARN" \
            --param="userPoolId=$USER_POOL_ID" \
            --param="kmsKeyId=$KMS_KEY_ID" \
            --param="documentsBucket=$DOCUMENTS_BUCKET"
        
        cd - > /dev/null
        log_success "$service deployed"
    done
}

# Deploy AppSync GraphQL API
deploy_appsync() {
    log_step "10/10 - Deploying AWS AppSync GraphQL API..."
    
    cd "$SERVERLESS_DIR/$APPSYNC_API"
    
    # Install dependencies
    npm install
    
    # Deploy AppSync
    serverless deploy \
        --stage "$ENVIRONMENT" \
        --region "$AWS_REGION" \
        --aws-profile "$AWS_PROFILE" \
        --param="userPoolId=$USER_POOL_ID"
    
    # Get AppSync endpoint
    export APPSYNC_ENDPOINT=$(serverless info --stage "$ENVIRONMENT" --region "$AWS_REGION" | grep "GraphQL endpoint" | awk '{print $3}')
    
    cd - > /dev/null
    log_success "AppSync API deployed"
    log_info "GraphQL Endpoint: $APPSYNC_ENDPOINT"
}

# Verify deployment
verify_deployment() {
    echo ""
    log_step "Verifying deployment..."
    
    # Check VPC
    aws ec2 describe-vpcs --vpc-ids "$VPC_ID" --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1
    log_success "✓ VPC verified"
    
    # Check Aurora cluster
    aws rds describe-db-clusters --db-cluster-identifier "${PROJECT_NAME}-${ENVIRONMENT}" --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1
    log_success "✓ Aurora cluster verified"
    
    # Check S3 bucket
    aws s3 ls "s3://${DOCUMENTS_BUCKET}" --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1
    log_success "✓ S3 bucket verified"
    
    # Check Cognito
    aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1
    log_success "✓ Cognito user pool verified"
    
    log_success "All resources verified successfully!"
}

# Print deployment summary
print_summary() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           Deployment Completed Successfully!              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Deployment Summary:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${YELLOW}Environment:${NC}        $ENVIRONMENT"
    echo -e "${YELLOW}Region:${NC}             $AWS_REGION"
    echo -e "${YELLOW}AWS Account:${NC}        $AWS_ACCOUNT_ID"
    echo ""
    echo -e "${YELLOW}VPC ID:${NC}             $VPC_ID"
    echo -e "${YELLOW}Database Endpoint:${NC}  $DB_ENDPOINT"
    echo -e "${YELLOW}Documents Bucket:${NC}   $DOCUMENTS_BUCKET"
    echo -e "${YELLOW}User Pool ID:${NC}       $USER_POOL_ID"
    echo -e "${YELLOW}GraphQL Endpoint:${NC}   $APPSYNC_ENDPOINT"
    echo ""
    echo -e "${BLUE}Client IDs:${NC}"
    echo -e "${YELLOW}  Staff Client:${NC}     $STAFF_CLIENT_ID"
    echo -e "${YELLOW}  Patient Client:${NC}   $PATIENT_CLIENT_ID"
    echo -e "${YELLOW}  Guardian Client:${NC}  $GUARDIAN_CLIENT_ID"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${GREEN}Next Steps:${NC}"
    echo "1. Update your frontend .env file with the above values"
    echo "2. Test the GraphQL API using the AppSync console"
    echo "3. Create initial admin user in Cognito"
    echo "4. Review CloudWatch logs and metrics"
    echo "5. Run integration tests"
    echo ""
    echo -e "${YELLOW}Documentation:${NC} See DEPLOYMENT_GUIDE.txt for detailed steps"
    echo ""
}

# Rollback function
rollback() {
    log_error "Deployment failed. Rolling back..."
    
    # Add rollback logic here if needed
    # This could include destroying resources or reverting to previous state
    
    exit 1
}

# Main execution
main() {
    trap rollback ERR
    
    print_banner
    
    # Confirm deployment
    echo -e "${YELLOW}You are about to deploy to:${NC}"
    echo "  Environment: $ENVIRONMENT"
    echo "  Region: $AWS_REGION"
    echo "  Profile: $AWS_PROFILE"
    echo ""
    read -p "Continue with deployment? (yes/no): " -r
    echo
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_warning "Deployment cancelled by user"
        exit 0
    fi
    
    # Execute deployment steps
    check_prerequisites
    init_terraform
    deploy_network
    deploy_database
    run_migrations
    deploy_storage
    deploy_cognito
    deploy_monitoring
    deploy_lambda_services
    deploy_appsync
    verify_deployment
    print_summary
}

# Run main function
main