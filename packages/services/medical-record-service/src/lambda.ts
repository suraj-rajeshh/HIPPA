import { AppSyncResolverHandler, AppSyncIdentityCognito } from 'aws-lambda';
import { db, encryption } from '@healthcare/shared';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { 
  MedicalRecordArguments, 
  MedicalRecordResult,
  MedicalRecord,
  Document,
  MedicalRecordInput,
  MedicalRecordUpdateInput,
  DocumentUploadInput,
  MedicalRecordFilter,
  MedicalRecordConnection
} from './types';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler: AppSyncResolverHandler<MedicalRecordArguments, MedicalRecordResult> = async (event) => {
  console.log('Medical Records Service Event:', JSON.stringify(event, null, 2));
  
  const { info: { fieldName }, arguments: args, identity } = event;
  const cognitoIdentity = identity as AppSyncIdentityCognito;

  try {
    if (!cognitoIdentity || !cognitoIdentity.sub) {
      throw new Error('Unauthorized');
    }

    switch (fieldName) {
      case 'getMedicalRecord':
        if (!args.id) throw new Error('Medical record ID is required');
        return await getMedicalRecord(args.id, cognitoIdentity);
      
      case 'listMedicalRecords':
        return await listMedicalRecords(
          args.filter ?? {},
          args.limit ?? 20,
          args.nextToken ?? null,
          cognitoIdentity
        );
      
      case 'createMedicalRecord':
        if (!args.input) throw new Error('Medical record input is required');
        return await createMedicalRecord(args.input as MedicalRecordInput, cognitoIdentity);
      
      case 'updateMedicalRecord':
        if (!args.id || !args.input) {
          throw new Error('Medical record ID and update input are required');
        }
        return await updateMedicalRecord(args.id, args.input as MedicalRecordUpdateInput, cognitoIdentity);
      
      case 'deleteMedicalRecord':
        if (!args.id) throw new Error('Medical record ID is required');
        return await deleteMedicalRecord(args.id, cognitoIdentity);
      
      case 'uploadDocument':
        if (!args.document) throw new Error('Document input is required');
        return await uploadDocument(args.document as DocumentUploadInput, cognitoIdentity);
      
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error('Medical Records Service Error:', error);
    throw error;
  }
};

async function getMedicalRecord(id: string, identity: AppSyncIdentityCognito): Promise<MedicalRecord> {
  const userId = identity.sub;
  const userRole = identity.claims['custom:role'];

  const record = await db.queryOne(
    `SELECT mr.*, 
            p.mrn, p.user_id as patient_user_id,
            pu.first_name as patient_first_name, pu.last_name as patient_last_name,
            prov.first_name as provider_first_name, prov.last_name as provider_last_name
     FROM medical_records mr
     LEFT JOIN patients p ON mr.patient_id = p.id
     LEFT JOIN users pu ON p.user_id = pu.id
     LEFT JOIN users prov ON mr.provider_id = prov.id
     WHERE mr.id = :recordId`,
    [id]
  );

  if (!record) {
    throw new Error('Medical record not found');
  }

  // Authorization check
  if (
    userRole === 'PATIENT' &&
    (record as any).patient_user_id !== userId
  ) {
    throw new Error('Access denied to medical record');
  }

  // Decrypt PHI content
  const rec = record as any;
  if (rec.content_encrypted) {
    rec.content = await encryption.decryptWithKMS(rec.content_encrypted);
    delete rec.content_encrypted;
  }

  // Log PHI access
  await logAccessEvent({
    userId: userId,
    recordId: id,
    action: 'ACCESSED',
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'MEDICAL_RECORD_ACCESSED',
    resource: 'medical_record',
    resourceId: id,
    phiAccessed: true,
  });

  return formatMedicalRecord(record);
}

async function listMedicalRecords(filter: MedicalRecordFilter, limit: number = 20, nextToken: string | null, identity: AppSyncIdentityCognito): Promise<MedicalRecordConnection> {
  const userId = identity.sub;
  const userRole = identity.claims['custom:role'];

  let query = `SELECT mr.*, 
                      p.mrn, p.user_id as patient_user_id,
                      pu.first_name as patient_first_name, pu.last_name as patient_last_name,
                      prov.first_name as provider_first_name, prov.last_name as provider_last_name
               FROM medical_records mr
               LEFT JOIN patients p ON mr.patient_id = p.id
               LEFT JOIN users pu ON p.user_id = pu.id
               LEFT JOIN users prov ON mr.provider_id = prov.id
               WHERE 1=1`;
  
  const params: any[] = [];
  let paramIndex = 0;

  // Apply role-based filters
  if (userRole === 'PATIENT') {
    query += ` AND p.user_id = :param${paramIndex}`;
    params.push(userId);
    paramIndex++;
  } else if (userRole === 'PROVIDER' && !filter?.patientId) {
    query += ` AND mr.provider_id = :param${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  // Apply additional filters
  if (filter?.patientId) {
    query += ` AND mr.patient_id = :param${paramIndex}`;
    params.push(filter.patientId);
    paramIndex++;
  }

  if (filter?.providerId) {
    query += ` AND mr.provider_id = :param${paramIndex}`;
    params.push(filter.providerId);
    paramIndex++;
  }

  if (filter?.recordType) {
    query += ` AND mr.record_type = :param${paramIndex}`;
    params.push(filter.recordType);
    paramIndex++;
  }

  if (filter?.startDate) {
    query += ` AND mr.date >= :param${paramIndex}`;
    params.push(filter.startDate);
    paramIndex++;
  }

  if (filter?.endDate) {
    query += ` AND mr.date <= :param${paramIndex}`;
    params.push(filter.endDate);
    paramIndex++;
  }

  query += ` ORDER BY mr.date DESC LIMIT ${limit}`;

  const records = await db.query(query, params);

  // Don't decrypt content for list view (performance)
  const formattedRecords = records.rows.map((r: any) => {
    delete r.content_encrypted;
    r.content = '[Encrypted - View record for details]';
    return formatMedicalRecord(r);
  });

  return {
    items: formattedRecords,
    nextToken: null,
  };
}

async function createMedicalRecord(input: MedicalRecordInput, identity: AppSyncIdentityCognito): Promise<MedicalRecord> {
  const userId = identity.sub;
  const userRole = identity.claims['custom:role'];

  // Only providers can create medical records
  if (userRole !== 'PROVIDER' && userRole !== 'ADMIN' && userRole !== 'NURSE') {
    throw new Error('Insufficient permissions to create medical record');
  }

  // Validate patient exists
  const patient = await db.queryOne(
    'SELECT * FROM patients WHERE id = :patientId',
    [input.patientId]
  );

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Encrypt PHI content
  const encryptedContent = await encryption.encryptWithKMS(input.content);

  const recordId = crypto.randomUUID();

  const record = await db.insert('medical_records', {
    id: recordId,
    patient_id: input.patientId,
    provider_id: input.providerId,
    record_type: input.recordType,
    date: input.date,
    title: input.title,
    content_encrypted: encryptedContent,
    icd10_codes: JSON.stringify(input.icd10Codes || []),
    cpt_codes: JSON.stringify(input.cptCodes || []),
    medications: JSON.stringify(input.medications || []),
    lab_results: JSON.stringify(input.labResults || []),
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Log access event
  await logAccessEvent({
    userId: userId,
    recordId: recordId,
    action: 'CREATED',
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'MEDICAL_RECORD_CREATED',
    resource: 'medical_record',
    resourceId: recordId,
    phiAccessed: true,
  });

  record.content = input.content;
  return formatMedicalRecord(record);
}

async function updateMedicalRecord(id: string, input: MedicalRecordUpdateInput, identity: AppSyncIdentityCognito): Promise<MedicalRecord> {
  const userId = identity.sub;
  const userRole = identity.claims['custom:role'];

  const existing = await db.queryOne(
    `SELECT mr.*, p.user_id as patient_user_id
     FROM medical_records mr
     LEFT JOIN patients p ON mr.patient_id = p.id
     WHERE mr.id = :recordId`,
    [id]
  );

  if (!existing) {
    throw new Error('Medical record not found');
  }

  // Only the provider who created it or admin can update
  if (
    (existing as any).provider_id !== userId &&
    userRole !== 'ADMIN'
  ) {
    throw new Error('Access denied to update medical record');
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  if (input.title) updateData.title = input.title;
  if (input.content) {
    updateData.content_encrypted = await encryption.encryptWithKMS(input.content);
  }
  if (input.icd10Codes) updateData.icd10_codes = JSON.stringify(input.icd10Codes);
  if (input.cptCodes) updateData.cpt_codes = JSON.stringify(input.cptCodes);
  if (input.medications) updateData.medications = JSON.stringify(input.medications);
  if (input.labResults) updateData.lab_results = JSON.stringify(input.labResults);

  const record = await db.update('medical_records', id, updateData);

  // Log access event
  await logAccessEvent({
    userId: userId,
    recordId: id,
    action: 'UPDATED',
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'MEDICAL_RECORD_UPDATED',
    resource: 'medical_record',
    resourceId: id,
    phiAccessed: true,
  });

  if (input.content) {
    record.content = input.content;
  }

  return formatMedicalRecord(record);
}

async function deleteMedicalRecord(id: string, identity: AppSyncIdentityCognito): Promise<boolean> {
  const userId = identity.sub;
  const userRole = identity.claims['custom:role'];

  if (userRole !== 'ADMIN') {
    throw new Error('Only administrators can delete medical records');
  }

  // Soft delete
  await db.update('medical_records', id, {
    is_active: false,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'MEDICAL_RECORD_DELETED',
    resource: 'medical_record',
    resourceId: id,
    phiAccessed: true,
  });

  return true;
}

async function uploadDocument(input: DocumentUploadInput, identity: AppSyncIdentityCognito): Promise<Document> {
  const userId = identity.sub;
  const userRole = identity.claims['custom:role'];

  // Only providers can upload documents
  if (userRole !== 'PROVIDER' && userRole !== 'ADMIN' && userRole !== 'NURSE') {
    throw new Error('Insufficient permissions to upload document');
  }

  // Validate patient exists
  const patient = await db.queryOne(
    'SELECT * FROM patients WHERE id = :patientId',
    [input.patientId]
  );

  if (!patient) {
    throw new Error('Patient not found');
  }

  const documentId = crypto.randomUUID();
  const key = `patients/${input.patientId}/documents/${documentId}/${input.filename}`;

  // Generate presigned URL for upload
  const putCommand = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: input.contentType,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: process.env.ENCRYPTION_KEY_ID,
  });

  const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });

  // Save document metadata
  const document = await db.insert('documents', {
    id: documentId,
    patient_id: input.patientId,
    medical_record_id: input.recordId,
    filename: input.filename,
    s3_key: key,
    content_type: input.contentType,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'DOCUMENT_UPLOADED',
    resource: 'document',
    resourceId: documentId,
    phiAccessed: true,
  });

  return {
    id: documentId,
    filename: input.filename,
    uploadUrl: uploadUrl,
    fileType: input.contentType,
    uploadedAt: document.uploaded_at,
  };
}

function formatMedicalRecord(record: any) {
  return {
    id: record.id,
    patientId: record.patient_id,
    providerId: record.provider_id,
    recordType: record.record_type,
    date: record.date,
    title: record.title,
    content: record.content || '[Encrypted]',
    icd10Codes: record.icd10_codes ? JSON.parse(record.icd10_codes) : [],
    cptCodes: record.cpt_codes ? JSON.parse(record.cpt_codes) : [],
    medications: record.medications ? JSON.parse(record.medications) : [],
    labResults: record.lab_results ? JSON.parse(record.lab_results) : [],
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function logAccessEvent(data: {
  userId: string;
  recordId: string;
  action: string;
}) {
  await db.insert('medical_record_access_logs', {
    id: crypto.randomUUID(),
    medical_record_id: data.recordId,
    user_id: data.userId,
    action: data.action,
    timestamp: new Date().toISOString(),
  });
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