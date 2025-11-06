import { z } from 'zod';

// Base User Schema
const baseUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  consentGiven: z.boolean()
});

// Staff Registration Schema
export const staffRegistrationSchema = baseUserSchema.extend({
  role: z.enum(['ADMIN', 'PROVIDER', 'NURSE', 'RECEPTIONIST', 'STAFF']),
  department: z.string().optional(),
  specialization: z.string().optional(),
  licenseNumber: z.string().optional(),
  npiNumber: z.string().optional()
});

// Patient Registration Schema
export const patientRegistrationSchema = baseUserSchema.extend({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string().optional()
  }).optional(),
  emergencyContact: z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string()
  }).optional(),
  insuranceInfo: z.object({
    provider: z.string(),
    policyNumber: z.string(),
    groupNumber: z.string().optional()
  }).optional()
});

// Guardian Registration Schema
export const guardianRegistrationSchema = baseUserSchema.extend({
  relationship: z.string(),
  patientIds: z.array(z.string().uuid())
});

// Login Schema
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  twoFactorCode: z.string().optional()
});

export function validate<T>(schema: z.Schema<T>, data: unknown): T {
  return schema.parse(data);
}