import { AppSyncResolverEvent, AppSyncResolverHandler, AppSyncIdentityCognito } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  ChangePasswordCommand,
  GlobalSignOutCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { 
  db, 
  config, 
  encryption,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
} from '@healthcare/shared';
import * as crypto from 'crypto';
import { 
  AuthArguments,
  AuthResult,
  AuthUser,
  AuthUserResponse
} from '@healthcare/shared';
import { 
  RegisterInput, 
  LoginInput, 
  ChangePasswordInput,
  AppSyncCognitoIdentity
} from './types';

// Type guards
function isRegisterInput(input: any): input is RegisterInput {
  return (
    input &&
    typeof input.email === 'string' &&
    typeof input.password === 'string' &&
    typeof input.firstName === 'string' &&
    typeof input.lastName === 'string' &&
    typeof input.role === 'string' &&
    typeof input.userType === 'string' &&
    typeof input.consentGiven === 'boolean'
  );
}

function isLoginInput(input: any): input is LoginInput {
  return (
    input &&
    typeof input.email === 'string' &&
    typeof input.password === 'string'
  );
}

function isChangePasswordInput(input: any): input is ChangePasswordInput {
  return (
    input &&
    typeof input.currentPassword === 'string' &&
    typeof input.newPassword === 'string'
  );
}

const cognitoClient = new CognitoIdentityProviderClient({
  region: config.aws.region,
});

// Input interfaces moved to types.ts

// Helper to validate Cognito identity
function isCognitoIdentity(identity: any): identity is AppSyncCognitoIdentity {
  return (
    identity &&
    typeof identity.sub === 'string' &&
    typeof identity.claims === 'object' &&
    typeof identity.claims['custom:role'] === 'string'
  );
}

export const handler: AppSyncResolverHandler<AuthArguments, AuthResult> = async (event) => {
  console.log('Auth Service Event:', JSON.stringify(event, null, 2));

  const { info: { fieldName }, arguments: args, identity } = event;

  try {
    switch (fieldName) {
      case 'register':
        if (!args.input || !isRegisterInput(args.input)) {
          throw new ValidationError('Invalid register input');
        }
        return await register(args.input);
      
      case 'login':
        if (!args.input || !isLoginInput(args.input)) {
          throw new ValidationError('Invalid login input');
        }
        return await login(args.input);
      
      case 'logout':
        if (!identity) {
          throw new UnauthorizedError('Authentication required for logout');
        }
        if (!isCognitoIdentity(identity)) {
          throw new UnauthorizedError('Invalid identity type');
        }
        return await logout(identity);
      
      case 'refreshToken':
        if (!args.refreshToken) {
          throw new ValidationError('Refresh token is required');
        }
        return await refreshToken(args.refreshToken);
      
      case 'me':
        if (!identity) {
          throw new UnauthorizedError('Authentication required');
        }
        if (!isCognitoIdentity(identity)) {
          throw new UnauthorizedError('Invalid identity type');
        }
        return await getMe(identity);
      
      case 'changePassword':
        if (!identity) {
          throw new UnauthorizedError('Authentication required for password change');
        }
        if (!isCognitoIdentity(identity)) {
          throw new UnauthorizedError('Invalid identity type');
        }
        if (!args.input || !isChangePasswordInput(args.input)) {
          throw new ValidationError('Invalid change password input');
        }
        return await changePassword(identity, args.input);
      
      default:
        throw new ValidationError(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error('Auth Service Error:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('AUTH_ERROR', 'Authentication service error', 500);
  }
};

async function register(input: RegisterInput): Promise<AuthUserResponse> {
  // Validate HIPAA consent
  if (!input.consentGiven) {
    throw new ValidationError('HIPAA consent is required for registration');
  }

  // Validate password strength
  if (!isValidPassword(input.password)) {
    throw new ValidationError(
      'Password must be at least 12 characters with uppercase, lowercase, number, and special character'
    );
  }

  try {
    // Create Cognito user
    const signUpCommand = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      Username: input.email,
      Password: input.password,
      UserAttributes: [
        { Name: 'email', Value: input.email },
        { Name: 'custom:role', Value: input.role },
        { Name: 'custom:userType', Value: input.userType },
      ],
    });

    const signUpResponse = await cognitoClient.send(signUpCommand);
    const cognitoUserId = signUpResponse.UserSub!;

    // Create user in database
    const user = await db.insert('users', {
      id: cognitoUserId,
      email: input.email,
      role: input.role,
      user_type: input.userType,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      date_of_birth: input.dateOfBirth,
      is_active: true,
      consent_given: input.consentGiven,
      hipaa_authorization_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Log HIPAA event
    await logHipaaEvent({
      userId: cognitoUserId,
      action: 'USER_REGISTERED',
      resource: 'user',
      resourceId: cognitoUserId,
      phiAccessed: false,
    });

    // Auto-confirm user (for development - remove in production)
    if (config.aws.stage === 'dev') {
      await autoConfirmUser(input.email);
    }

    // Login to get tokens
    return await login({ email: input.email, password: input.password });
  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.code === 'UsernameExistsException') {
      throw new ConflictError('User with this email already exists');
    }
    throw new AppError('REGISTRATION_ERROR', `Registration failed: ${error.message}`, 500);
  }
}

async function login(input: LoginInput): Promise<AuthUserResponse> {
  try {
    const authCommand = new InitiateAuthCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password,
      },
    });

    const authResponse = await cognitoClient.send(authCommand);

    if (!authResponse.AuthenticationResult) {
      throw new UnauthorizedError('Authentication failed');
    }

    // Get user details
    const getUserCommand = new GetUserCommand({
      AccessToken: authResponse.AuthenticationResult.AccessToken!,
    });

    const userResponse = await cognitoClient.send(getUserCommand);
    const cognitoUserId = userResponse.Username!;

    // Update last login in database
    await db.executeStatement(
      'UPDATE users SET last_login = NOW() WHERE id = :userId',
      [cognitoUserId]
    );

    // Get user from database
    const user = await db.queryOne(
      'SELECT * FROM users WHERE id = :userId',
      [cognitoUserId]
    );

    if (!user) {
      throw new NotFoundError('User account not found in database');
    }

    // Log HIPAA event
    await logHipaaEvent({
      userId: cognitoUserId,
      action: 'USER_LOGIN',
      resource: 'auth',
      phiAccessed: false,
    });

    const formattedUser = formatUser(user);
    return {
      ...formattedUser,
      accessToken: authResponse.AuthenticationResult.AccessToken!,
      refreshToken: authResponse.AuthenticationResult.RefreshToken!,
    };
  } catch (error: any) {
    console.error('Login error:', error);
    if (error.code === 'NotAuthorizedException') {
      throw new UnauthorizedError('Invalid email or password');
    }
    if (error.code === 'UserNotConfirmedException') {
      throw new UnauthorizedError('Email address not verified');
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('LOGIN_ERROR', `Login failed: ${error.message}`, 500);
  }
}

async function logout(identity: AppSyncCognitoIdentity) {
  try {
    const userId = identity.sub;
    const token = identity.sourceIp[0]; // In AppSync, the access token is passed in sourceIp

    const globalSignOutCommand = new GlobalSignOutCommand({
      AccessToken: token
    });

    await cognitoClient.send(globalSignOutCommand);

    // Log HIPAA event
    await logHipaaEvent({
      userId,
      action: 'USER_LOGOUT',
      resource: 'auth',
      phiAccessed: false,
    });

    return true;
  } catch (error: any) {
    console.error('Logout error:', error);
    throw new UnauthorizedError(`Logout failed: ${error.message}`);
  }
}

async function getMe(identity: AppSyncCognitoIdentity): Promise<AuthUserResponse> {
  const accessToken = identity.sourceIp[0];
  try {
    const userId = identity.sub;

    const user = await db.queryOne(
      'SELECT * FROM users WHERE id = :userId',
      [userId]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const formattedUser = formatUser(user);
    return {
      ...formattedUser,
      accessToken,
      refreshToken: ''  // Note: refresh token is not available in getMe context
    };
  } catch (error: any) {
    console.error('Get me error:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('USER_ERROR', `Failed to get user: ${error.message}`, 500);
  }
}

// Helper functions
function isValidPassword(password: string): boolean {
  const minLength = 12;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return (
    password.length >= minLength &&
    hasUpperCase &&
    hasLowerCase &&
    hasNumbers &&
    hasSpecialChar
  );
}

async function autoConfirmUser(email: string) {
  // This is a development-only function
  // In production, users should confirm via email
  const adminSetPasswordCommand = new AdminSetUserPasswordCommand({
    UserPoolId: config.cognito.userPoolId,
    Username: email,
    Password: process.env.DEV_DEFAULT_PASSWORD || 'Ch@ngeMe123!',
    Permanent: true,
  });

  await cognitoClient.send(adminSetPasswordCommand);
}

async function logHipaaEvent(data: {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  phiAccessed: boolean;
}) {
  await db.insert('audit_logs', {
    id: crypto.randomUUID(),
    user_id: data.userId,
    action: data.action,
    resource: data.resource,
    resource_id: data.resourceId,
    phi_accessed: data.phiAccessed,
    timestamp: new Date().toISOString(),
  });
}

function formatUser(user: any): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role.toUpperCase(),
    userType: user.user_type.toUpperCase(),
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    dateOfBirth: user.date_of_birth,
    isActive: user.is_active,
    lastLogin: user.last_login,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

async function refreshToken(token: string): Promise<AuthUserResponse> {
  try {
    const authCommand = new InitiateAuthCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: token,
      },
    });

    const authResponse = await cognitoClient.send(authCommand);

    if (!authResponse.AuthenticationResult) {
      throw new UnauthorizedError('Token refresh failed');
    }

    // Get user details from the token
    const getUserCommand = new GetUserCommand({
      AccessToken: authResponse.AuthenticationResult.AccessToken!,
    });

    const userResponse = await cognitoClient.send(getUserCommand);
    const cognitoUserId = userResponse.Username!;

    // Get user from database
    const user = await db.queryOne(
      'SELECT * FROM users WHERE id = :userId',
      [cognitoUserId]
    );

    if (!user) {
      throw new NotFoundError('User account not found in database');
    }

    const formattedUser = formatUser(user);
    return {
      ...formattedUser,
      accessToken: authResponse.AuthenticationResult.AccessToken!,
      refreshToken: token,
    };
  } catch (error: any) {
    console.error('Refresh token error:', error);
    throw new UnauthorizedError(`Token refresh failed: ${error.message}`);
  }
}

async function changePassword(identity: AppSyncCognitoIdentity, input: ChangePasswordInput) {
  try {
    const token = identity.sourceIp[0]; // In AppSync, the access token is passed in sourceIp

    const changePasswordCommand = new ChangePasswordCommand({
      AccessToken: token,
      PreviousPassword: input.currentPassword,
      ProposedPassword: input.newPassword,
    });

    await cognitoClient.send(changePasswordCommand);

    // Log HIPAA event
    await logHipaaEvent({
      userId: identity.sub,
      action: 'PASSWORD_CHANGED',
      resource: 'auth',
      phiAccessed: false,
    });

    return true;
  } catch (error: any) {
    console.error('Change password error:', error);
    throw new UnauthorizedError(`Password change failed: ${error.message}`);
  }
}


