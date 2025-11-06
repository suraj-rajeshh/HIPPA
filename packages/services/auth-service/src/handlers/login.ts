import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  GetUserCommand,
  CognitoIdentityProviderServiceException
} from '@aws-sdk/client-cognito-identity-provider';
import {
  UserRole,
  UserType,
  AuthUserResponse,
  PatientUserResponse,
  GuardianUserResponse,
  UnauthorizedError,
  NotFoundError,
  validateUserRoleAndType,
  db
} from '@healthcare/shared';
import type { StaffRecord, PatientRecord, GuardianRecord } from '../types/index';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export async function staffLogin(email: string, password: string): Promise<AuthUserResponse> {
  try {
    // Validate staff credentials with Cognito
    const authResponse = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: process.env.COGNITO_CLIENT_ID_STAFF,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      })
    ).catch(error => {
      if (error.name === 'NotAuthorizedException') {
        throw new UnauthorizedError('Invalid email or password');
      } else if (error.name === 'UserNotFoundException') {
        throw new NotFoundError('User account not found');
      }
      throw error;
    });

    if (!authResponse.AuthenticationResult?.AccessToken) {
      throw new UnauthorizedError('Authentication failed - no access token');
    }

    // Get user details and validate role
    const userInfo = await cognito.send(
      new GetUserCommand({
        AccessToken: authResponse.AuthenticationResult.AccessToken
      })
    ).catch(error => {
      throw new UnauthorizedError('Failed to retrieve user information');
    });

    const role = userInfo.UserAttributes?.find(attr => attr.Name === 'custom:role')?.Value;
    if (!role) {
      throw new UnauthorizedError('User role not assigned');
    }

    if (!Object.values(UserRole).includes(role as UserRole)) {
      throw new UnauthorizedError(`Invalid role: ${role}`);
    }

    if (![UserRole.ADMIN, UserRole.PROVIDER, UserRole.NURSE, UserRole.STAFF].includes(role as UserRole)) {
      throw new UnauthorizedError('Unauthorized access to staff portal');
    }

    // Get staff details from database
    const staffResult = await db.query<StaffRecord>(`
      SELECT 
        id,
        email,
        first_name,
        last_name,
        phone,
        role,
        department,
        specialization,
        license_number,
        npi_number,
        is_active,
        last_login,
        created_at,
        updated_at
      FROM users
      WHERE email = $1 AND user_type = $2
    `, [email, UserType.SERVICE_PROVIDER]);

    if (staffResult.rowCount === 0) {
      throw new NotFoundError('Staff account not found');
    }

    const staffRecord = staffResult.rows[0];
    return {
      id: staffRecord.id,
      email: staffRecord.email,
      firstName: staffRecord.first_name,
      lastName: staffRecord.last_name,
      role: staffRecord.role as UserRole,
      userType: UserType.SERVICE_PROVIDER,
      phone: staffRecord.phone ?? undefined,
      department: staffRecord.department,
      specialization: staffRecord.specialization,
      licenseNumber: staffRecord.license_number,
      npiNumber: staffRecord.npi_number,
      isActive: staffRecord.is_active,
      lastLogin: staffRecord.last_login?.toISOString(),
      createdAt: staffRecord.created_at.toISOString(),
      updatedAt: staffRecord.updated_at.toISOString(),
      accessToken: authResponse.AuthenticationResult!.AccessToken!,
      refreshToken: authResponse.AuthenticationResult!.RefreshToken!
    };
  } catch (error) {
    if (error instanceof CognitoIdentityProviderServiceException) {
      throw new UnauthorizedError('Invalid credentials');
    }
    throw error;
  }
}

export async function patientLogin(email: string, password: string): Promise<PatientUserResponse> {
  try {
    // Validate patient credentials with Cognito
    const authResponse = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: process.env.COGNITO_CLIENT_ID_PATIENT,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      })
    ).catch(error => {
      if (error.name === 'NotAuthorizedException') {
        throw new UnauthorizedError('Invalid email or password');
      } else if (error.name === 'UserNotFoundException') {
        throw new NotFoundError('Patient account not found');
      }
      throw error;
    });

    if (!authResponse.AuthenticationResult?.AccessToken) {
      throw new UnauthorizedError('Authentication failed - no access token');
    }

    // Get user details and validate role
    const userInfo = await cognito.send(
      new GetUserCommand({
        AccessToken: authResponse.AuthenticationResult.AccessToken
      })
    ).catch(() => {
      throw new UnauthorizedError('Failed to retrieve patient information');
    });

    const role = userInfo.UserAttributes?.find(attr => attr.Name === 'custom:role')?.Value as UserRole;
    const userType = userInfo.UserAttributes?.find(attr => attr.Name === 'custom:userType')?.Value as UserType;

    if (role !== UserRole.PATIENT) {
      throw new UnauthorizedError('Not authorized for patient access');
    }

    if (!validateUserRoleAndType(role, userType)) {
      throw new UnauthorizedError('Invalid role and user type combination');
    }

    // Get patient details including their guardians
    const patientResult = await db.query<PatientRecord>(`
      SELECT 
        p.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', g.id,
          'relationship', pg.relationship,
          'firstName', g.first_name,
          'lastName', g.last_name,
          'email', g.email,
          'phone', g.phone,
          'lastLogin', g.last_login
        )) FILTER (WHERE g.id IS NOT NULL) as guardians
      FROM patients p
      LEFT JOIN patient_guardians pg ON p.id = pg.patient_id
      LEFT JOIN users g ON pg.guardian_id = g.id
      WHERE p.email = $1 AND p.user_type = $2
      GROUP BY p.id
    `, [email, UserType.CLIENT]);

    if (patientResult.rowCount === 0) {
      throw new NotFoundError('Patient record not found');
    }

    const patientRecord = patientResult.rows[0];
    return {
      id: patientRecord.id,
      email: patientRecord.email,
      firstName: patientRecord.first_name,
      lastName: patientRecord.last_name,
      role: UserRole.PATIENT,
      userType: UserType.CLIENT,
      dateOfBirth: patientRecord.date_of_birth,
      mrn: patientRecord.mrn,
      primaryProviderId: patientRecord.primary_provider_id,
      guardians: (patientRecord.guardians || []).map((g: NonNullable<PatientRecord['guardians']>[number]) => ({
        id: g.id,
        relationship: g.relationship,
        firstName: g.first_name,
        lastName: g.last_name,
        email: g.email,
        phone: g.phone
      })),
      isActive: true,
      createdAt: new Date().toISOString(), // TODO: Get from record
      updatedAt: new Date().toISOString(), // TODO: Get from record
      accessToken: authResponse.AuthenticationResult!.AccessToken!,
      refreshToken: authResponse.AuthenticationResult!.RefreshToken!
    };
  } catch (error) {
    if (error instanceof CognitoIdentityProviderServiceException) {
      throw new UnauthorizedError('Invalid credentials');
    }
    throw error;
  }
}

export async function guardianLogin(email: string, password: string): Promise<GuardianUserResponse> {
  try {
    const authResponse = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: process.env.COGNITO_CLIENT_ID_PATIENT,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password
        }
      })
    ).catch(error => {
      if (error.name === 'NotAuthorizedException') {
        throw new UnauthorizedError('Invalid email or password');
      } else if (error.name === 'UserNotFoundException') {
        throw new NotFoundError('Guardian account not found');
      }
      throw error;
    });

    if (!authResponse.AuthenticationResult?.AccessToken) {
      throw new UnauthorizedError('Authentication failed - no access token');
    }

    // Get guardian details including their patients
    const guardianResult = await db.query<GuardianRecord>(`
      SELECT 
        g.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', p.id,
          'relationship', pg.relationship,
          'firstName', p.first_name,
          'lastName', p.last_name,
          'dateOfBirth', p.date_of_birth,
          'mrn', p.mrn
        )) FILTER (WHERE p.id IS NOT NULL) as patients
      FROM users g
      JOIN patient_guardians pg ON g.id = pg.guardian_id
      JOIN patients p ON pg.patient_id = p.id
      WHERE g.email = $1 AND g.role = $2
      GROUP BY g.id
    `, [email, UserRole.GUARDIAN]);

    if (guardianResult.rowCount === 0) {
      throw new NotFoundError('Guardian record not found');
    }

    const guardianRecord = guardianResult.rows[0];
    return {
      id: guardianRecord.id,
      email: guardianRecord.email,
      firstName: guardianRecord.first_name,
      lastName: guardianRecord.last_name,
      phone: guardianRecord.phone ?? undefined,
      role: UserRole.GUARDIAN,
      userType: UserType.GUARDIAN,
      isActive: true,
      createdAt: new Date().toISOString(), // TODO: Get from record
      updatedAt: new Date().toISOString(), // TODO: Get from record
      patients: (guardianRecord.patients || []).map((p: NonNullable<GuardianRecord['patients']>[number]) => ({
        id: p.id,
        relationship: p.relationship,
        firstName: p.first_name,
        lastName: p.last_name,
        dateOfBirth: p.date_of_birth,
        mrn: p.mrn
      })),
      accessToken: authResponse.AuthenticationResult!.AccessToken!,
      refreshToken: authResponse.AuthenticationResult!.RefreshToken!
    };
  } catch (error) {
    if (error instanceof CognitoIdentityProviderServiceException) {
      throw new UnauthorizedError('Invalid credentials');
    }
    throw error;
  }
}