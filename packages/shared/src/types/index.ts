import { UserRole, UserType } from './auth';
export * from './auth';
export * from './auth-response';
export * from './middleware';

// Common AppSync Types
export interface AppSyncIdentity {
  sub: string;
  'custom:role'?: string;
  'custom:userType'?: string;
  email?: string;
}

// Base Types
export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface Audit extends Timestamps {
  createdBy: string;
  updatedBy: string;
}

// User Types
export interface User extends Timestamps {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  userType: UserType;
  status: UserStatus;
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED'
}

// Patient Types
export interface Patient extends Timestamps {
  id: string;
  userId: string;
  mrn: string;
  dateOfBirth: string;
  gender: string;
  phoneNumber: string;
  address: Address;
  emergencyContact: EmergencyContact;
  primaryProviderId?: string;
  insuranceInfo?: InsuranceInfo;
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phoneNumber: string;
}

export interface InsuranceInfo {
  provider: string;
  policyNumber: string;
  groupNumber?: string;
  primaryInsured: string;
  relationshipToPrimary: string;
  expirationDate?: string;
}

// Appointment Types
export interface Appointment extends Timestamps {
  id: string;
  patientId: string;
  providerId: string;
  appointmentDate: string;
  duration: number;
  type: AppointmentType;
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
  location?: string;
  isVirtual: boolean;
  reminderSent: boolean;
  cancelledBy?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export enum AppointmentType {
  INITIAL = 'INITIAL',
  FOLLOW_UP = 'FOLLOW_UP',
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  TELEHEALTH = 'TELEHEALTH'
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

export interface AppointmentFilter {
  patientId?: string;
  providerId?: string;
  status?: AppointmentStatus;
  startDate?: string;
  endDate?: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

// Medical Record Types
export interface MedicalRecord extends Timestamps {
  id: string;
  patientId: string;
  providerId: string;
  visitDate: string;
  type: MedicalRecordType;
  diagnosis: Diagnosis[];
  medications: Medication[];
  allergies: Allergy[];
  vitalSigns: VitalSigns;
  notes: string;
  attachments?: Attachment[];
}

export enum MedicalRecordType {
  VISIT_NOTE = 'VISIT_NOTE',
  LAB_RESULT = 'LAB_RESULT',
  IMAGING = 'IMAGING',
  PROCEDURE = 'PROCEDURE',
  VACCINATION = 'VACCINATION'
}

export interface Diagnosis {
  code: string;
  description: string;
  type: string;
  status: string;
  notes?: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  startDate: string;
  endDate?: string;
  prescribedBy: string;
  status: string;
  notes?: string;
}

export interface Allergy {
  substance: string;
  reaction: string;
  severity: string;
  status: string;
  onsetDate?: string;
  notes?: string;
}

export interface VitalSigns {
  temperature?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  height?: number;
  weight?: number;
  bmi?: number;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  s3Key: string;
  contentType: string;
}

// HIPAA Audit Log Types
export interface HipaaAuditLog extends Timestamps {
  id: string;
  userId: string;
  action: HipaaAction;
  resource: string;
  resourceId?: string;
  phiAccessed: boolean;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: any;
  responseBody?: any;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  duration?: number;
}

export enum HipaaAction {
  RECORD_CREATED = 'RECORD_CREATED',
  RECORD_READ = 'RECORD_READ',
  RECORD_UPDATED = 'RECORD_UPDATED',
  RECORD_DELETED = 'RECORD_DELETED',
  PHI_ACCESSED = 'PHI_ACCESSED',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT'
}

// Pagination Types
export interface PaginatedResponse<T> {
  items: T[];
  nextToken: string | null;
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
