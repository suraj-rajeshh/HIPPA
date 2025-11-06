import * as Joi from 'joi';

const addressSchema = Joi.object({
  street: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  zipCode: Joi.string().required(),
  country: Joi.string().default('USA')
});

const emergencyContactSchema = Joi.object({
  name: Joi.string().required(),
  relationship: Joi.string().required(),
  phone: Joi.string().required(),
  email: Joi.string().email()
});

const demographicsSchema = Joi.object({
  ssn: Joi.string().pattern(/^\d{3}-?\d{2}-?\d{4}$/),
  address: addressSchema.required(),
  emergencyContact: emergencyContactSchema.required()
});

const insuranceSchema = Joi.object({
  provider: Joi.string().required(),
  policyNumber: Joi.string(),
  groupNumber: Joi.string(),
  subscriberId: Joi.string(),
  effectiveDate: Joi.date().iso(),
  expirationDate: Joi.date().iso().min(Joi.ref('effectiveDate'))
});

const surgerySchema = Joi.object({
  name: Joi.string().required(),
  date: Joi.date().iso().required(),
  notes: Joi.string()
});

const immunizationSchema = Joi.object({
  name: Joi.string().required(),
  date: Joi.date().iso().required(),
  lot: Joi.string()
});

const medicalHistorySchema = Joi.object({
  allergies: Joi.array().items(Joi.string()),
  chronicConditions: Joi.array().items(Joi.string()),
  medications: Joi.array().items(Joi.string()),
  surgeries: Joi.array().items(surgerySchema),
  familyHistory: Joi.array().items(Joi.string()),
  immunizations: Joi.array().items(immunizationSchema)
});

export const createPatientSchema = Joi.object({
  userId: Joi.string().required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  dateOfBirth: Joi.date().iso(),
  gender: Joi.string().valid('M', 'F', 'O'),
  contactNumber: Joi.string(),
  email: Joi.string().email(),
  demographics: demographicsSchema.required(),
  insurance: insuranceSchema,
  medicalHistory: medicalHistorySchema,
  preferredLanguage: Joi.string(),
  assignedProviderId: Joi.string(),
});

export const updatePatientSchema = Joi.object({
  demographics: demographicsSchema,
  insurance: insuranceSchema,
  preferredLanguage: Joi.string(),
}).min(1); // At least one field must be provided

export const searchPatientSchema = Joi.object({
  query: Joi.string().required(),
});

export const patientSchema = {
  createPatient: createPatientSchema,
  updatePatient: updatePatientSchema,
  searchPatient: searchPatientSchema
};