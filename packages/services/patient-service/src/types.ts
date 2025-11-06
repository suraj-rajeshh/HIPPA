import { Timestamps } from '@healthcare/shared';

// Input Types
export interface PatientDemographics {
  ssn?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
    email?: string;
  };
}

export interface PatientInsurance {
  provider: string;
  policyNumber?: string;
  groupNumber?: string;
  subscriberId?: string;
  effectiveDate?: string;
  expirationDate?: string;
}

export interface MedicalHistory {
  allergies?: string[];
  chronicConditions?: string[];
  medications?: string[];
  surgeries?: string[];
  familyHistory?: string[];
  immunizations?: string[];
}

export interface CreatePatientInput {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  contactNumber?: string;
  email?: string;
  demographics: PatientDemographics;
  insurance?: PatientInsurance;
  medicalHistory?: MedicalHistory;
  preferredLanguage?: string;
  assignedProviderId?: string;
}

export interface UpdatePatientInput {
  demographics?: PatientDemographics;
  insurance?: PatientInsurance;
  preferredLanguage?: string;
}

export interface PatientFilter {
  assignedProviderId?: string;
  isActive?: boolean;
}

// Response Types
export interface Patient extends Timestamps {
  id: string;
  userId: string;
  mrn: string;
  demographics: {
    ssn: string;
    address: IAddress;
    emergencyContact: IEmergencyContact;
  };
  insurance: IInsurance;
  medicalHistory: IMedicalHistory;
  preferredLanguage?: string;
  accessibilityNeeds?: string[];
  communicationPreferences?: {
    email: boolean;
    sms: boolean;
    phone: boolean;
  };
  metadata: {
    lastVisit?: string;
    nextVisit?: string;
    assignedProviderId?: string;
    tags: string[];
  };
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
}

export interface PatientConnection {
  items: Patient[];
  nextToken: string | null;
  total: number; // Total number of records matching the filter
}

// Arguments Type
export interface PatientArguments {
  id?: string;
  input?: CreatePatientInput | UpdatePatientInput;
  filter?: PatientFilter;
  query?: string;
  limit?: number;
  nextToken?: string;
  page?: number;
  search?: string;
  assignedProviderId?: string;
  isActive?: boolean;
}

export interface IAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface IEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface IInsurance {
  provider: string;
  policyNumber: string;
  groupNumber: string;
  subscriberId?: string;
  effectiveDate?: string;
  expirationDate?: string;
}

export interface IMedicalHistory {
  allergies: string[];
  chronicConditions: string[];
  medications: string[];
  surgeries: Array<{ name: string; date: string; notes?: string }>;
  familyHistory: string[];
  immunizations: Array<{ name: string; date: string; lot?: string }>;
}

// Union of all possible return types
export type PatientResult = 
  | Patient
  | Patient[]
  | PatientConnection
  | boolean
  | null;