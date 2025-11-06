import { AppSyncResolverEvent, AppSyncResolverHandler, AppSyncIdentityCognito } from 'aws-lambda';
import {
  PatientArguments,
  PatientResult,
  CreatePatientInput,
  UpdatePatientInput,
  PatientFilter
} from './types';
import { HipaaAction } from '@healthcare/shared';
import { patientSchema } from './validation';
import {
  getPatient,
  listPatients,
  searchPatients,
  createPatient,
  updatePatient,
  deletePatient,
} from './functions';
import {
  withErrorHandler,
  withSecurityHeaders,
  validateRequest,
  UnauthorizedError,
  ValidationError,
  withAuditLog,
  compose,
  appSyncToLambda,
  authenticate,
  authorize,
  AuthContext
} from '@healthcare/shared';

// Extend AppSync event type to include auth context
type AuthenticatedAppSyncEvent<TArgs> = AppSyncResolverEvent<TArgs> & { authContext: AuthContext };


// Define allowed roles for different operations
const VIEW_ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'PATIENT', 'GUARDIAN'];
const MODIFY_ROLES = ['ADMIN', 'DOCTOR'];

// Authentication middleware
const withAuth = (handler: any) => async (event: any, context: any) => {
  // Get token from AppSync identity
  const token = event.request?.headers?.authorization;
  if (!token) {
    throw new UnauthorizedError('No authentication token provided');
  }

  // Authenticate and add auth context to event
  const authContext = await authenticate(token);
  event.authContext = authContext;

  return handler(event, context);
};

// Compose middleware
const withMiddleware = compose(
  withErrorHandler,
  withSecurityHeaders,
  withAuth,
  withAuditLog({ resourceType: 'PATIENT', phiAccessed: true }),
  validateRequest(patientSchema)
);

// Base handler without middleware
// Convert AuthContext to the identity format expected by functions
function toFunctionIdentity(authContext: AuthContext) {
  return {
    sub: authContext.userId,
    claims: {
      'custom:role': authContext.role,
      'custom:userType': authContext.userType
    }
  };
}

const baseHandler = async (event: AuthenticatedAppSyncEvent<PatientArguments>): Promise<PatientResult> => {
  const { info: { fieldName }, arguments: args, authContext } = event;

  // Helper to check if user has access to specific patient
  const hasPatientAccess = (patientId: string) => {
    return authContext.role === 'ADMIN' || 
           authContext.role === 'DOCTOR' || 
           authContext.role === 'NURSE' ||
           (authContext.role === 'PATIENT' && authContext.userId === patientId) ||
           (authContext.role === 'GUARDIAN' && (authContext as any).guardianFor?.includes(patientId));
  };

  // Convert AuthContext to function identity format
  const identity = toFunctionIdentity(authContext);

  // Validate input based on operation
  switch (fieldName) {
    case 'getPatient':
      if (!args.id) {
        throw new ValidationError('Patient ID is required');
      }
      // Check if user has access to this specific patient
      if (!hasPatientAccess(args.id)) {
        throw new UnauthorizedError('You do not have access to this patient\'s information');
      }
      return await getPatient(args.id, identity);
    
    case 'listPatients':
      // Only staff can list all patients
      authorize(['ADMIN', 'DOCTOR', 'NURSE'])(authContext);
      return await listPatients(
        args.filter as PatientFilter,
        args.limit ?? 20,
        args.nextToken ?? null,
        identity
      );
    
    case 'searchPatients':
      // Only staff can search patients
      authorize(['ADMIN', 'DOCTOR', 'NURSE'])(authContext);
      if (!args.query) {
        throw new ValidationError('Search query is required');
      }
      return await searchPatients(args.query, identity);
    
    case 'createPatient':
      // Only staff can create patients
      authorize(['ADMIN', 'DOCTOR'])(authContext);
      if (!args.input) {
        throw new ValidationError('Patient input is required');
      }
      return await createPatient(args.input as CreatePatientInput, identity);
    
    case 'updatePatient':
      // Only staff or self can update patient info
      if (!args.id) {
        throw new ValidationError('Patient ID is required');
      }
      if (!args.input) {
        throw new ValidationError('Update input is required');
      }
      if (!hasPatientAccess(args.id)) {
        throw new UnauthorizedError('You do not have permission to update this patient\'s information');
      }
      return await updatePatient(args.id, args.input as UpdatePatientInput, identity);
    
    case 'deletePatient':
      // Only admin can delete patients
      authorize(['ADMIN'])(authContext);
      if (!args.id) {
        throw new ValidationError('Patient ID is required');
      }
      return await deletePatient(args.id, identity);
    
    default:
      throw new ValidationError(`Unknown operation: ${fieldName}`);
  }
};

// Convert authenticated handler to standard AppSync handler
const convertToAppSyncHandler = (handler: (event: AuthenticatedAppSyncEvent<PatientArguments>) => Promise<PatientResult>): AppSyncResolverHandler<PatientArguments, PatientResult> => {
  return async (event) => {
    // Add authContext to event
    const identity = event.identity as AppSyncIdentityCognito;
    
    const authContext = {
      userId: identity?.sub ?? '',
      email: identity?.claims?.email ?? '',
      role: identity?.claims?.['custom:role'] ?? 'PATIENT',
      userType: identity?.claims?.['custom:userType'] ?? 'client'
    };
    
    const authenticatedEvent = {
      ...event,
      authContext
    } as AuthenticatedAppSyncEvent<PatientArguments>;

    return handler(authenticatedEvent);
  };
};

// Export handler with middleware applied
const adaptedHandler = appSyncToLambda(convertToAppSyncHandler(baseHandler));
export const handler = withMiddleware(adaptedHandler);