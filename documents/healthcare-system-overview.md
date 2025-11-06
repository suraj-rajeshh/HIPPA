# HIPAA-Compliant Healthcare System - Technical Overview

## Executive Summary

A serverless, cloud-native healthcare management system built on AWS infrastructure with GraphQL API layer, implementing comprehensive HIPAA compliance measures including encryption, audit logging, and role-based access control.

## Architecture Overview

### Technology Stack

**Backend Services**
- Runtime: Node.js 20.x
- API Layer: AWS AppSync (GraphQL)
- Database: Aurora Serverless v2 (PostgreSQL)
- Authentication: AWS Cognito
- Storage: AWS S3 with KMS encryption
- Monitoring: CloudWatch, CloudTrail, GuardDuty

**Infrastructure as Code**
- Terraform for AWS resource provisioning
- Serverless Framework for Lambda deployment

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│                    (Web/Mobile Apps)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   AWS AppSync (GraphQL)                      │
│                  + Cognito Authentication                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Lambda Services Layer                     │
│  ┌────────────┬──────────────┬─────────────┬──────────────┐ │
│  │   Auth     │   Patient    │ Appointment │   Medical    │ │
│  │  Service   │   Service    │   Service   │   Records    │ │
│  └────────────┴──────────────┴─────────────┴──────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     Data Layer                               │
│  ┌─────────────────┬──────────────┬──────────────────────┐  │
│  │  Aurora         │  DynamoDB    │       S3 +           │  │
│  │  PostgreSQL     │  (Audit      │       KMS            │  │
│  │  (Encrypted)    │   Logs)      │   (Documents)        │  │
│  └─────────────────┴──────────────┴──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Services

### 1. Authentication Service (`auth-service`)

**Responsibilities:**
- User registration and login
- Password management
- Session management (access/refresh tokens)
- Role-based authorization

**Key Features:**
- Multi-client support (Staff, Patient, Guardian)
- Separate Cognito client IDs for different user types
- Role validation against user type
- Audit logging for all auth events

**User Roles:**
- `ADMIN`, `PROVIDER`, `NURSE`, `RECEPTIONIST`, `STAFF` (Service Providers)
- `PATIENT` (Clients)
- `GUARDIAN` (Guardian for patients)

**Authentication Flow:**
```typescript
// Role-based login routing
if (isStaffRole(role)) → staffLogin()
else if (role === PATIENT) → patientLogin()
else if (role === GUARDIAN) → guardianLogin()
```

### 2. Patient Service (`patient-service`)

**Responsibilities:**
- Patient record management (CRUD operations)
- Medical history tracking
- Insurance information management
- Patient search and filtering

**Key Features:**
- Automatic MRN (Medical Record Number) generation
- Encrypted PHI storage (SSN, insurance details)
- Role-based access control for viewing/editing
- Soft delete functionality

**Data Model:**
```typescript
interface Patient {
  id: UUID
  userId: UUID
  mrn: string (auto-generated: MRN000001)
  demographics: {
    ssn: string (encrypted)
    address: Address
    emergencyContact: EmergencyContact
  }
  insurance: Insurance
  medicalHistory: MedicalHistory
  metadata: {
    assignedProviderId?: UUID
    lastVisit?: Date
    nextVisit?: Date
  }
}
```

### 3. Appointment Service

**Responsibilities:**
- Appointment scheduling and management
- Provider availability tracking
- Appointment reminders
- Status management

**Appointment Statuses:**
- `SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`

### 4. Medical Records Service

**Responsibilities:**
- Medical record creation and retrieval
- Document upload to S3
- Diagnostic code tracking (ICD-10, CPT)
- Lab results management

**Record Types:**
- `DIAGNOSIS`, `PRESCRIPTION`, `LAB_RESULT`, `IMAGING`, `PROCEDURE`, `NOTE`

## Security & HIPAA Compliance

### Encryption Strategy

**At Rest:**
- Aurora: Encrypted with AWS KMS
- S3: Server-side encryption (SSE-KMS)
- DynamoDB: Encryption enabled
- All PHI fields individually encrypted

**In Transit:**
- TLS 1.2+ for all communications
- Certificate pinning for mobile apps

**Application-Level Encryption:**
```typescript
// Sensitive fields encrypted before storage
const encryptedSSN = await encryption.encryptWithKMS(ssn);
const encryptedInsurance = await encryption.encryptWithKMS(insuranceData);
```

### Access Control

**Multi-Level Authorization:**

1. **Cognito Authentication** (Layer 1)
   - JWT token validation
   - MFA support

2. **Role-Based Access Control** (Layer 2)
   - Role validation in middleware
   - User type validation

3. **Resource-Level Authorization** (Layer 3)
   - Patient can only access own records
   - Guardian can access ward's records
   - Provider can access assigned patients

**Authorization Example:**
```typescript
// Patient access check
const hasPatientAccess = (patientId: string) => {
  return authContext.role === 'ADMIN' || 
         authContext.role === 'DOCTOR' || 
         (authContext.role === 'PATIENT' && 
          authContext.userId === patientId);
};
```

### Audit Logging

**Comprehensive Logging:**
- All PHI access logged to DynamoDB
- Immutable audit trail
- 7-year retention (HIPAA requirement)
- Real-time monitoring with CloudWatch

**Audit Log Structure:**
```typescript
interface AuditLog {
  id: UUID
  timestamp: ISO8601
  userId: UUID
  action: HipaaAction
  resource: string
  resourceId?: UUID
  phiAccessed: boolean
  ipAddress: string
  userAgent: string
  duration: number
  error?: ErrorDetails
}
```

**Tracked Actions:**
- `RECORD_CREATED`, `RECORD_READ`, `RECORD_UPDATED`, `RECORD_DELETED`
- `PHI_ACCESSED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`

## Database Schema

### Core Tables

**users**
- Primary user authentication data
- Links to Cognito user pool
- Role and user type management

**patients**
- Patient demographic information
- Encrypted sensitive fields (SSN, insurance)
- Assignment to providers

**medical_histories**
- Allergies, chronic conditions
- Current medications
- Surgical history, immunizations

**appointments**
- Scheduling information
- Provider assignments
- Status tracking

**medical_records**
- Encrypted medical content
- ICD-10/CPT codes
- Lab results (JSONB)

**audit_logs**
- HIPAA compliance logging
- User activity tracking
- PHI access monitoring

### Data Encryption Strategy

```sql
-- Example of encrypted fields
CREATE TABLE patients (
  id UUID PRIMARY KEY,
  ssn_encrypted TEXT,
  insurance_policy_number_encrypted TEXT,
  -- Other fields...
);
```

## GraphQL API

### Schema Organization

**Top-Level Types:**
- `Query` - Read operations
- `Mutation` - Write operations
- `Subscription` - Real-time updates

**Core Types:**
```graphql
type User {
  id: ID!
  email: String!
  role: UserRole!
  userType: UserType!
  firstName: String!
  lastName: String!
}

type Patient {
  id: ID!
  mrn: String!
  demographics: Demographics!
  insurance: Insurance
  medicalHistory: MedicalHistory
  appointments: [Appointment!]
  medicalRecords: [MedicalRecord!]
}

type Appointment {
  id: ID!
  patientId: ID!
  providerId: ID!
  appointmentDate: String!
  status: AppointmentStatus!
}

type MedicalRecord {
  id: ID!
  patientId: ID!
  providerId: ID!
  recordType: RecordType!
  title: String!
  content: String! # Encrypted
}
```

### Authentication Flow

```graphql
mutation Login {
  login(input: {
    email: "patient@example.com"
    password: "SecurePass123!@#"
  }) {
    accessToken
    refreshToken
    user {
      id
      role
      userType
    }
  }
}
```

## Middleware Architecture

### Composable Middleware Pattern

```typescript
const withMiddleware = compose(
  withErrorHandler,
  withSecurityHeaders,
  withAuth,
  withAuditLog({ resourceType: 'PATIENT', phiAccessed: true }),
  validateRequest(schema)
);
```

**Middleware Layers:**

1. **Error Handler** - Catches and formats all errors
2. **Security Headers** - HSTS, CSP, X-Frame-Options
3. **Authentication** - JWT validation, user context
4. **Audit Logging** - Automatic PHI access tracking
5. **Request Validation** - Schema-based input validation

## Infrastructure

### Terraform Modules

**VPC & Networking:**
- Private subnets for Aurora
- Public subnets for NAT Gateway
- Security groups with least privilege

**Aurora Serverless v2:**
- PostgreSQL 15.4
- Auto-scaling: 0.5 - 2.0 ACU
- Multi-AZ deployment
- 35-day backup retention
- Point-in-time recovery

**Cognito Configuration:**
```hcl
resource "aws_cognito_user_pool" "main" {
  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
  mfa_configuration = "OPTIONAL"
}
```

**KMS Encryption:**
- Automatic key rotation enabled
- Separate keys for different data types
- 30-day deletion window

**S3 Configuration:**
- Versioning enabled
- Public access blocked
- Lifecycle policies (90-day Glacier, 365-day Deep Archive)
- Server-side encryption with KMS

### Monitoring & Alerting

**CloudWatch Alarms:**
- Lambda error rate > 5%
- Aurora CPU > 80%
- API Gateway 5xx errors
- GuardDuty findings

**CloudWatch Dashboard:**
- Real-time metrics
- Lambda invocations and errors
- Database connections and CPU
- API latency distribution

**CloudTrail:**
- All API calls logged
- S3 data events tracked
- Multi-region trail
- Log file validation

## Deployment

### Environment Configuration

**Development:**
```bash
npm run build
serverless deploy --stage dev
```

**Production:**
```bash
terraform apply -var-file=prod.tfvars
serverless deploy --stage prod
```

### CI/CD Pipeline (GitHub Actions)

```yaml
steps:
  - Install dependencies
  - Run tests
  - Build TypeScript
  - Deploy infrastructure (Terraform)
  - Deploy services (Serverless)
  - Run integration tests
```

## Error Handling

### Standardized Error Responses

```typescript
class AppError extends Error {
  code: string
  statusCode: number
  details?: Record<string, any>
}
```

**Error Types:**
- `ValidationError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)

## Testing Strategy

**Unit Tests:**
- Service layer logic
- Utility functions
- Middleware components

**Integration Tests:**
- GraphQL resolvers
- Database operations
- Authentication flows

**Load Tests:**
```bash
artillery run tests/load-test.yml
```

## Performance Optimization

**Database:**
- Proper indexing on frequently queried fields
- Connection pooling
- Query optimization

**Lambda:**
- Provisioned concurrency for critical functions
- Cold start optimization
- Appropriate memory allocation

**Caching:**
- AppSync response caching
- CloudFront for static assets

## Monitoring Queries

**View Recent Audit Logs:**
```sql
SELECT * FROM audit_logs 
WHERE phi_accessed = true 
ORDER BY timestamp DESC 
LIMIT 100;
```

**Patient Dashboard:**
```sql
SELECT * FROM patient_dashboard
WHERE id = 'patient-uuid';
```

**Provider Workload:**
```sql
SELECT * FROM provider_dashboard
WHERE provider_id = 'provider-uuid';
```

## Security Best Practices

1. **Principle of Least Privilege** - IAM roles with minimal permissions
2. **Defense in Depth** - Multiple security layers
3. **Zero Trust** - Verify every request
4. **Data Minimization** - Collect only necessary PHI
5. **Regular Audits** - Weekly security reviews
6. **Encryption Everywhere** - At rest and in transit
7. **Secure Defaults** - All features secure by default

## Compliance Checklist

- ✅ Encryption at rest (KMS)
- ✅ Encryption in transit (TLS 1.2+)
- ✅ Audit logging (7-year retention)
- ✅ Access controls (RBAC)
- ✅ Authentication (Cognito + MFA)
- ✅ PHI access tracking
- ✅ Automatic backups (35 days)
- ✅ Disaster recovery (Multi-AZ)
- ✅ Security monitoring (GuardDuty)
- ✅ Network isolation (VPC)

## Troubleshooting Guide

**Lambda Timeout:**
```yaml
# Increase timeout in serverless.yml
functions:
  authService:
    timeout: 30
```

**Database Connection Issues:**
```bash
aws ec2 describe-security-groups --group-ids <sg-id>
```

**Enable Debug Logging:**
```bash
export DEBUG=healthcare:*
npm run dev
```

## Future Enhancements

1. **Multi-Region Deployment** - Global availability
2. **Advanced Analytics** - ML-based insights
3. **Telemedicine Integration** - Video consultations
4. **Mobile Apps** - iOS/Android native apps
5. **FHIR Compliance** - Standard healthcare data exchange
6. **Blockchain Audit Trail** - Immutable audit logs
7. **AI Assistant** - Clinical decision support

## References

- [AWS HIPAA Compliance](https://aws.amazon.com/compliance/hipaa-compliance/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

---

**Version:** 1.0.0  
**Last Updated:** November 2024  
**Maintained By:** Healthcare Development Team