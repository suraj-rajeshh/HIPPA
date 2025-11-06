export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  userType: string;
  phone?: string;
  dateOfBirth?: string;
  consentGiven: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Type for AppSync identity with auth token
export interface AppSyncCognitoIdentity {
  sub: string;
  username: string;
  sourceIp: string[];
  claims: {
    'custom:role': string;
    'custom:userType': string;
    email: string;
  };
  defaultAuthStrategy: string;
  groups: string[];
  issuer: string;
}