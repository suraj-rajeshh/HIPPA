export interface StaffRecord {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  department?: string;
  specialization?: string;
  license_number?: string;
  npi_number?: string;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PatientRecord {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  mrn: string;
  primary_provider_id?: string;
  guardians?: Array<{
    id: string;
    relationship: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    last_login?: Date;
  }>;
}

export interface GuardianRecord {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  patients?: Array<{
    id: string;
    relationship: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    mrn: string;
  }>;
}