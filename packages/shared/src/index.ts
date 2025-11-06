// Export configuration
export { config } from './config';

// Export middleware
export { authenticate, authorize, type AuthContext } from './middleware/auth';
export {
  withErrorHandler,
  withSecurityHeaders,
  validateRequest,
  type ErrorResponse,
  type ApiError,
  type ErrorDetails
} from './middleware/handler';
export { withAuditLog } from './middleware/auditLog';
export { appSyncToLambda } from './middleware/appsync';

// Export errors
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
} from './errors';

// Export base types
export {
  UserRole,
  UserType,
  AuthUser,
  PatientUser,
  GuardianUser,
  AuthArguments,
  RegisterStaffInput,
  RegisterPatientInput,
  RegisterGuardianInput,
  LoginInput,
  ChangePasswordInput,
  GuardianshipRequest,
  GuardianInfo
} from './types/auth';

// Export common types
export {
  Timestamps,
  HipaaAction,
  DatabaseRecord,
  PaginationResponse
} from './types/common';

// Export auth response types
export {
  AuthUserResponse,
  PatientUserResponse,
  GuardianUserResponse,
  AuthResult,
  AppSyncIdentity
} from './types/auth-response';

// Export appointment types
export {
  Appointment,
  AppointmentFilter,
  TimeSlot,
  AppointmentConnection,
  PaginatedResponse
} from './types/appointment';

// Export medical record types
export {
  MedicalRecord,
  MedicalRecordFilter,
  MedicalRecordCreate,
  MedicalRecordUpdate,
  MedicalRecordConnection
} from './types/medical-record';

// Export utilities and helpers
export {
  db,
  encryption,
  compose,
  sanitizeSensitiveData,
  DatabaseQueryResult
} from './utils';

// Export role utilities
export {
  STAFF_ROLES,
  CLIENT_ROLES,
  isStaffRole,
  isClientRole,
  validateUserRoleAndType
} from './utils/roles';