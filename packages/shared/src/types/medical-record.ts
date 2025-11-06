import { Timestamps } from './common';

export interface MedicalRecord extends Timestamps {
  id: string;
  patientId: string;
  patientUserId: string;
  providerId: string;
  type: string;
  content: string;
  contentEncrypted: string;
  status: string;
  isConfidential: boolean;
  tags?: string[];
  attachments?: string[];
}

export interface MedicalRecordFilter {
  patientId?: string;
  providerId?: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  tags?: string[];
}

export interface MedicalRecordCreate {
  patientId: string;
  patientUserId: string;
  providerId: string;
  type: string;
  content: string;
  status?: string;
  isConfidential?: boolean;
  tags?: string[];
  attachments?: string[];
}

export interface MedicalRecordUpdate {
  type?: string;
  content?: string;
  status?: string;
  isConfidential?: boolean;
  tags?: string[];
  attachments?: string[];
}

export interface MedicalRecordConnection {
  items: MedicalRecord[];
  nextToken?: string;
  total: number;
}