import { AppSyncIdentityCognito } from 'aws-lambda';

export interface MedicalRecordInput {
  patientId: string;
  providerId: string;
  recordType: string;
  date: string;
  title: string;
  content: string;
  icd10Codes?: string[];
  cptCodes?: string[];
  medications?: string[];
  labResults?: string[];
}

export interface MedicalRecordUpdateInput {
  title?: string;
  content?: string;
  icd10Codes?: string[];
  cptCodes?: string[];
  medications?: string[];
  labResults?: string[];
}

export interface MedicalRecordFilter {
  patientId?: string;
  providerId?: string;
  recordType?: string;
  startDate?: string;
  endDate?: string;
}

export interface DocumentUploadInput {
  patientId: string;
  recordId?: string;
  filename: string;
  contentType: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  providerId: string;
  recordType: string;
  date: string;
  title: string;
  content: string;
  icd10Codes: string[];
  cptCodes: string[];
  medications: string[];
  labResults: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  filename: string;
  uploadUrl: string;
  fileType: string;
  uploadedAt: string;
}

export interface MedicalRecordConnection {
  items: MedicalRecord[];
  nextToken: string | null;
}

export interface MedicalRecordArguments {
  id?: string;
  input?: MedicalRecordInput | MedicalRecordUpdateInput;
  filter?: MedicalRecordFilter;
  limit?: number;
  nextToken?: string;
  document?: DocumentUploadInput;
}

export type MedicalRecordResult = 
  | MedicalRecord 
  | MedicalRecord[] 
  | MedicalRecordConnection 
  | Document 
  | boolean;