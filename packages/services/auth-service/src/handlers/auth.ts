import { AppSyncResolverHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand
} from '@aws-sdk/client-cognito-identity-provider';
import {
  AuthArguments,
  AuthResult,
  UserRole,
  UserType,
  AppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  validateUserRoleAndType,
  isStaffRole
} from '@healthcare/shared';
import { validate, loginSchema } from '../validation';
import { staffLogin, patientLogin, guardianLogin } from './login';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler: AppSyncResolverHandler<AuthArguments, AuthResult | boolean> = async (event) => {
  try {
    const { fieldName } = event.info;
    const input = event.arguments.input;

    switch (fieldName) {
      case 'login': {
        // Validate login input
        if (!input) {
          throw new ValidationError('Login input is required');
        }

        const loginData = validate(loginSchema, input);
        
        // First, get the user type from Cognito
        const userInfo = await cognito.send(
          new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: loginData.email
          })
        ).catch(error => {
          if (error.name === 'UserNotFoundException') {
            throw new NotFoundError('User account not found');
          }
          throw error;
        });

        const role = userInfo.UserAttributes?.find(attr => attr.Name === 'custom:role')?.Value as UserRole;
        const userType = userInfo.UserAttributes?.find(attr => attr.Name === 'custom:userType')?.Value as UserType;

        if (!role) {
          throw new UnauthorizedError('User role not assigned');
        }

        if (!userType) {
          throw new UnauthorizedError('User type not assigned');
        }

        if (!validateUserRoleAndType(role, userType)) {
          throw new UnauthorizedError('Invalid role and user type combination');
        }

        // Route to appropriate login handler
        if (isStaffRole(role)) {
          return await staffLogin(loginData.email, loginData.password);
        } else if (role === UserRole.PATIENT) {
          return await patientLogin(loginData.email, loginData.password);
        } else if (role === UserRole.GUARDIAN) {
          return await guardianLogin(loginData.email, loginData.password);
        } else {
          throw new UnauthorizedError('Invalid user role');
        }
      }

      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error('[Auth Handler Error]:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new Error('An unexpected error occurred during authentication');
  }
};