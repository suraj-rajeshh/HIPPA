-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('PATIENT', 'GUARDIAN', 'PROVIDER', 'ADMIN', 'NURSE', 'RECEPTIONIST')),
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('CLIENT', 'SERVICE_PROVIDER')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    consent_given BOOLEAN NOT NULL,
    hipaa_authorization_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    mrn VARCHAR(50) UNIQUE NOT NULL,
    ssn_encrypted TEXT,
    address_street VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(2),
    address_zip_code VARCHAR(10),
    address_country VARCHAR(2) DEFAULT 'US',
    emergency_contact_name VARCHAR(255),
    emergency_contact_relationship VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_email VARCHAR(255),
    insurance_provider VARCHAR(255),
    insurance_policy_number_encrypted TEXT,
    insurance_group_number VARCHAR(100),
    insurance_subscriber_id VARCHAR(100),
    insurance_effective_date DATE,
    insurance_expiration_date DATE,
    preferred_language VARCHAR(10) DEFAULT 'en',
    assigned_provider_id UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patients_user_id ON patients(user_id);
CREATE INDEX idx_patients_mrn ON patients(mrn);
CREATE INDEX idx_patients_assigned_provider ON patients(assigned_provider_id);

-- Medical Histories table
CREATE TABLE IF NOT EXISTS medical_histories (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    allergies JSONB DEFAULT '[]',
    chronic_conditions JSONB DEFAULT '[]',
    medications JSONB DEFAULT '[]',
    surgeries JSONB DEFAULT '[]',
    family_history JSONB DEFAULT '[]',
    immunizations JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_medical_histories_patient_id ON medical_histories(patient_id);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id),
    provider_id UUID NOT NULL REFERENCES users(id),
    appointment_date TIMESTAMP NOT NULL,
    duration INTEGER NOT NULL,
    type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    reason TEXT NOT NULL,
    notes TEXT,
    location VARCHAR(255),
    is_virtual BOOLEAN DEFAULT false,
    reminder_sent BOOLEAN DEFAULT false,
    cancelled_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_provider_id ON appointments(provider_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Medical Records table
CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id),
    provider_id UUID NOT NULL REFERENCES users(id),
    record_type VARCHAR(50) NOT NULL CHECK (record_type IN ('DIAGNOSIS', 'PRESCRIPTION', 'LAB_RESULT', 'IMAGING', 'PROCEDURE', 'NOTE')),
    date DATE NOT NULL,
    title VARCHAR(500) NOT NULL,
    content_encrypted TEXT NOT NULL,
    icd10_codes JSONB DEFAULT '[]',
    cpt_codes JSONB DEFAULT '[]',
    medications JSONB DEFAULT '[]',
    lab_results JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX idx_medical_records_provider_id ON medical_records(provider_id);
CREATE INDEX idx_medical_records_date ON medical_records(date);
CREATE INDEX idx_medical_records_type ON medical_records(record_type);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id),
    medical_record_id UUID REFERENCES medical_records(id),
    filename VARCHAR(500) NOT NULL,
    s3_key TEXT NOT NULL,
    content_type VARCHAR(100),
    file_size BIGINT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_patient_id ON documents(patient_id);
CREATE INDEX idx_documents_medical_record_id ON documents(medical_record_id);

-- Medical Record Access Logs table
CREATE TABLE IF NOT EXISTS medical_record_access_logs (
    id UUID PRIMARY KEY,
    medical_record_id UUID NOT NULL REFERENCES medical_records(id),
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_logs_record_id ON medical_record_access_logs(medical_record_id);
CREATE INDEX idx_access_logs_user_id ON medical_record_access_logs(user_id);
CREATE INDEX idx_access_logs_timestamp ON medical_record_access_logs(timestamp);

-- Audit Logs table (HIPAA compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id UUID,
    phi_accessed BOOLEAN DEFAULT false,
    ip_address VARCHAR(50),
    user_agent TEXT,
    metadata JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_phi_accessed ON audit_logs(phi_accessed);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medical_records_updated_at BEFORE UPDATE ON medical_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for patient dashboard
CREATE OR REPLACE VIEW patient_dashboard AS
SELECT 
    p.id,
    p.mrn,
    u.first_name,
    u.last_name,
    u.email,
    COUNT(DISTINCT a.id) as total_appointments,
    COUNT(DISTINCT mr.id) as total_records,
    MAX(a.appointment_date) as last_visit,
    MIN(CASE WHEN a.appointment_date > CURRENT_TIMESTAMP THEN a.appointment_date END) as next_visit
FROM patients p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN appointments a ON p.id = a.patient_id
LEFT JOIN medical_records mr ON p.id = mr.patient_id
WHERE p.is_active = true
GROUP BY p.id, p.mrn, u.first_name, u.last_name, u.email;

-- View for provider dashboard
CREATE OR REPLACE VIEW provider_dashboard AS
SELECT 
    u.id as provider_id,
    u.first_name,
    u.last_name,
    COUNT(DISTINCT p.id) as total_patients,
    COUNT(DISTINCT CASE WHEN a.appointment_date::date = CURRENT_DATE THEN a.id END) as today_appointments,
    COUNT(DISTINCT CASE WHEN a.status = 'SCHEDULED' AND a.appointment_date > CURRENT_TIMESTAMP THEN a.id END) as upcoming_appointments
FROM users u
LEFT JOIN patients p ON u.id = p.assigned_provider_id
LEFT JOIN appointments a ON u.id = a.provider_id
WHERE u.role = 'PROVIDER' AND u.is_active = true
GROUP BY u.id, u.first_name, u.last_name;