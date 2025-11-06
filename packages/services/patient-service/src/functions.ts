import { db, encryption, PaginationResponse, DatabaseQueryResult } from '@healthcare/shared';
import * as crypto from 'crypto';
import { 
  CreatePatientInput, 
  UpdatePatientInput, 
  PatientFilter,
  Patient,
  PatientConnection
} from './types';

// Helper function to generate MRN
async function generateMRN(): Promise<string> {
  const result = await db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM patients');
  const count = parseInt(result?.count || '0', 10);
  return `MRN${String(count + 1).padStart(6, '0')}`;
}

// Helper function to decrypt sensitive data
async function decryptSensitiveData(patient: Record<string, any>): Promise<Patient> {
  if (patient?.demographics?.ssn) {
    patient.demographics.ssn = await encryption.decryptWithKMS(patient.demographics.ssn);
  }
  return patient as Patient;
}

export async function getPatient(
  id: string,
  identity: { sub: string; claims: { 'custom:role': string } }
): Promise<Patient | null> {
  const { sub: userId, claims } = identity;
  const role = claims['custom:role'];

  let query = 'SELECT * FROM patients WHERE ';
  const params = [];

  // If patient is requesting their own record
  if (role === 'PATIENT') {
    query += 'user_id = $1';
    params.push(userId);
  } else if (['PROVIDER', 'ADMIN', 'NURSE'].includes(role)) {
    query += 'id = $1';
    params.push(id);
  } else {
    throw new Error('Unauthorized');
  }

  const result = await db.queryOne(query, params);
  if (!result) return null;

  return decryptSensitiveData(result);
}

export async function listPatients(
  filter: PatientFilter,
  limit: number = 20,
  nextToken: string | null,
  identity: { sub: string; claims: { 'custom:role': string } }
): Promise<PatientConnection> {
  const { claims } = identity;
  const role = claims['custom:role'];

  if (!['PROVIDER', 'ADMIN', 'NURSE', 'RECEPTIONIST'].includes(role)) {
    throw new Error('Unauthorized');
  }

  let query = 'SELECT * FROM patients WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filter?.assignedProviderId) {
    params.push(filter.assignedProviderId);
    query += ` AND metadata->>'assignedProviderId' = $${paramIndex++}`;
  }

  if (filter?.isActive !== undefined) {
    params.push(filter.isActive);
    query += ` AND is_active = $${paramIndex++}`;
  }

  // Add total count query for pagination
  const countQuery = query.replace('*', 'COUNT(*) as total');
  const countResult = await db.queryOne<{ total: string }>(countQuery, params);
  const total = parseInt(countResult?.total || '0', 10);

  // Add sorting and pagination
  query += ' ORDER BY created_at DESC';
  
  if (limit) {
    params.push(limit);
    query += ` LIMIT $${paramIndex++}`;
  }

  if (nextToken) {
    params.push(parseInt(nextToken, 10));
    query += ` OFFSET $${paramIndex++}`;
  }

  const { rows: results } = await db.query<Patient>(query, params);
  const decryptedResults = await Promise.all(results.map(decryptSensitiveData));

  return {
    items: decryptedResults,
    nextToken: results.length === limit && (parseInt(nextToken || '0') + limit) < total 
      ? (parseInt(nextToken || '0') + limit).toString() 
      : null,
    total // Adding total for client-side pagination calculations
  };
}

export async function searchPatients(
  query: string,
  identity: { sub: string; claims: { 'custom:role': string } }
): Promise<Patient[]> {
  const { claims } = identity;
  const role = claims['custom:role'];

  if (!['PROVIDER', 'ADMIN', 'NURSE', 'RECEPTIONIST'].includes(role)) {
    throw new Error('Unauthorized');
  }

  const sql = `
    SELECT * FROM patients 
    WHERE 
      mrn ILIKE $1 
      OR first_name ILIKE $1 
      OR last_name ILIKE $1
      OR contact_number ILIKE $1
      OR email ILIKE $1
    LIMIT 20
  `;

  const { rows: results } = await db.query<Patient>(sql, [`%${query}%`]);
  return Promise.all(results.map(decryptSensitiveData));
}

export async function createPatient(
  input: CreatePatientInput,
  identity: { sub: string; claims: { 'custom:role': string } }
): Promise<Patient> {
  const { sub: userId, claims } = identity;
  const role = claims['custom:role'];

  if (!['ADMIN', 'RECEPTIONIST'].includes(role)) {
    throw new Error('Unauthorized');
  }

  const patientId = crypto.randomUUID();
  const mrn = await generateMRN();

  // Encrypt sensitive data if provided
  let encryptedSSN;
  if (input.demographics?.ssn) {
    encryptedSSN = await encryption.encryptWithKMS(input.demographics.ssn);
  }

  const patient = {
    id: patientId,
    mrn,
    userId: input.userId,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender || '',
    contactNumber: input.contactNumber || '',
    email: input.email || '',
    demographics: {
      ...input.demographics,
      ssn: encryptedSSN,
    },
    insurance: input.insurance || null,
    medicalHistory: input.medicalHistory || {
      allergies: [],
      chronicConditions: [],
      medications: [],
      surgeries: [],
      familyHistory: [],
      immunizations: []
    },
    preferredLanguage: input.preferredLanguage || 'en',
    communicationPreferences: {
      email: true,
      sms: true,
      phone: true
    },
    metadata: {
      assignedProviderId: input.assignedProviderId,
      lastVisit: null,
      nextVisit: null,
      tags: []
    },
    isActive: true,
    createdBy: userId,
    updatedBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await db.insert('patients', patient);
  const created = await getPatient(patientId, identity);
  if (!created) throw new Error('Failed to create patient record');
  return created;
}

export async function updatePatient(
  id: string,
  input: UpdatePatientInput,
  identity: { sub: string; claims: { 'custom:role': string } }
): Promise<Patient | null> {
  const { sub: userId, claims } = identity;
  const role = claims['custom:role'];

  if (!['PROVIDER', 'ADMIN', 'NURSE'].includes(role)) {
    throw new Error('Unauthorized');
  }

  const updates: Record<string, any> = {
    updatedBy: userId,
    updatedAt: new Date().toISOString()
  };

  // If SSN is being updated, encrypt it
  if (input.demographics?.ssn) {
    const encryptedSSN = await encryption.encryptWithKMS(input.demographics.ssn);
    updates.demographics = {
      ...input.demographics,
      ssn: encryptedSSN
    };
  } else if (input.demographics) {
    updates.demographics = input.demographics;
  }

  // Merge updates
  if (input.insurance) updates.insurance = input.insurance;
  if (input.preferredLanguage) updates.preferredLanguage = input.preferredLanguage;

  await db.update('patients', id, updates);
  return getPatient(id, identity);
}

export async function deletePatient(
  id: string,
  identity: { sub: string; claims: { 'custom:role': string } }
): Promise<boolean> {
  const { sub: userId, claims } = identity;
  const role = claims['custom:role'];

  if (role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }

  // Soft delete by updating is_active flag
  const updates = {
    is_active: false,
    updated_by: userId,
    updated_at: new Date().toISOString()
  };

  const result = await db.update('patients', id, updates);
  return !!result;
}