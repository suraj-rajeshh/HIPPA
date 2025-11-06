export enum UserRole {
  ADMIN = 'ADMIN',
  PROVIDER = 'PROVIDER',
  NURSE = 'NURSE',
  RECEPTIONIST = 'RECEPTIONIST',
  STAFF = 'STAFF',
  PATIENT = 'PATIENT',
  GUARDIAN = 'GUARDIAN'
}

export enum UserType {
  CLIENT = 'CLIENT',
  GUARDIAN = 'GUARDIAN',
  SERVICE_PROVIDER = 'SERVICE_PROVIDER',
  SYSTEM = 'SYSTEM'
}

// Input Types
export interface RegisterStaffInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  department?: string;
  specialization?: string;
  licenseNumber?: string;
  npiNumber?: string;
}

export interface RegisterPatientInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  insuranceInfo?: {
    provider: string;
    policyNumber: string;
    groupNumber?: string;
  };
  consentGiven: boolean;
}

export interface RegisterGuardianInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  relationship: string;
  patientIds: string[]; // IDs of patients this guardian is responsible for
  consentGiven: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface GuardianshipRequest {
  guardianEmail: string;
  patientId: string;
  relationship: string;
}

// Result Types
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  userType: UserType;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  isActive: boolean;
  lastLogin?: string;
  department?: string;
  specialization?: string;
  licenseNumber?: string;
  npiNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientUser extends AuthUser {
  mrn?: string;
  guardians?: GuardianInfo[];
  primaryProviderId?: string;
}

export interface GuardianUser extends AuthUser {
  patients: Array<{
    id: string;
    relationship: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    mrn: string;
  }>;
}

export interface GuardianInfo {
  id: string;
  relationship: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

// Arguments Type
export interface AuthArguments {
  input?: RegisterStaffInput | RegisterPatientInput | RegisterGuardianInput | LoginInput | ChangePasswordInput | GuardianshipRequest;
  refreshToken?: string;
}