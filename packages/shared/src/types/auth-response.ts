import { AuthUser, PatientUser, GuardianUser } from './auth';

export interface AuthUserResponse extends AuthUser {
  accessToken: string;
  refreshToken: string;
}

export interface PatientUserResponse extends PatientUser {
  accessToken: string;
  refreshToken: string;
}

export interface GuardianUserResponse extends GuardianUser {
  accessToken: string;
  refreshToken: string;
}

export type AuthResult = AuthUserResponse | PatientUserResponse | GuardianUserResponse | boolean;

export interface AppSyncIdentity {
  sub: string;
  username?: string;
  claims: {
    'custom:role': string;
    'custom:userType': string;
    email: string;
    [key: string]: string | undefined;
  };
  sourceIp?: string[];
  defaultAuthStrategy?: string;
  groups?: string[];
  issuer?: string;
}