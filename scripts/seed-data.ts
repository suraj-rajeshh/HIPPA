import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DatabaseClient } from '../packages/shared/src/utils/database';
import { encryption } from '../packages/shared/src/utils/encryption';
import crypto from 'crypto';

const db = new DatabaseClient();

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const env = process.argv.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';

interface UserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  userType: string;
  phone?: string;
  dateOfBirth?: string;
  isGuardianOf?: string[];
}

interface MedicalHistory {
  allergies: string[];
  chronicConditions: string[];
  medications: string[];
  surgeries: Array<{
    name: string;
    date: string;
    notes: string;
  }>;
  familyHistory: string[];
  immunizations: Array<{
    name: string;
    date: string;
    lot: string;
  }>;
}

interface PatientData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  contact_info: {
    email: string;
    phone: string;
  };
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  insurance_info: {
    provider: string;
    policy_number: string;
    group_number: string;
  };
  medical_history: MedicalHistory;
}

const testPatients: PatientData[] = [
  {
    first_name: 'Alice',
    last_name: 'Brown',
    date_of_birth: '1990-05-15',
    gender: 'F',
    contact_info: {
      email: 'alice.brown@email.com',
      phone: '+1234567901',
    },
    address: {
      street: '123 Main St',
      city: 'Boston',
      state: 'MA',
      zip: '02108',
    },
    insurance_info: {
      provider: 'Blue Cross',
      policy_number: 'BC123456789',
      group_number: 'G1234',
    },
    medical_history: {
      allergies: ['Penicillin', 'Pollen'],
      chronicConditions: ['Asthma'],
      medications: ['Albuterol Inhaler', 'Zyrtec'],
      surgeries: [
        {
          name: 'Appendectomy',
          date: '2015-03-15',
          notes: 'Routine procedure, no complications',
        },
      ],
      familyHistory: ['Diabetes - Maternal', 'Heart Disease - Paternal'],
      immunizations: [
        {
          name: 'Flu Vaccine',
          date: '2023-10-01',
          lot: 'FL2023A',
        },
        {
          name: 'COVID-19 Vaccine',
          date: '2023-04-15',
          lot: 'CV2023B',
        },
      ],
    },
  },
  {
    first_name: 'Bob',
    last_name: 'Davis',
    date_of_birth: '1985-08-22',
    gender: 'M',
    contact_info: {
      email: 'bob.davis@email.com',
      phone: '+1234567902',
    },
    address: {
      street: '456 Oak Ave',
      city: 'Boston',
      state: 'MA',
      zip: '02109',
    },
    insurance_info: {
      provider: 'Aetna',
      policy_number: 'AE987654321',
      group_number: 'G5678',
    },
    medical_history: {
      allergies: ['Shellfish'],
      chronicConditions: ['Hypertension'],
      medications: ['Lisinopril'],
      surgeries: [
        {
          name: 'Knee Arthroscopy',
          date: '2018-06-20',
          notes: 'Left knee, successful procedure',
        },
      ],
      familyHistory: ['Hypertension - Both Parents'],
      immunizations: [
        {
          name: 'Tetanus',
          date: '2020-01-15',
          lot: 'TT2020A',
        },
        {
          name: 'COVID-19 Vaccine',
          date: '2023-04-20',
          lot: 'CV2023B',
        },
      ],
    },
  },
];

const testUsers: UserData[] = [
  {
    email: 'admin@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'System',
    lastName: 'Administrator',
    role: 'ADMIN',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567800',
  },
  {
    email: 'dr.smith@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'John',
    lastName: 'Smith',
    role: 'PROVIDER',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567890',
  },
  {
    email: 'dr.johnson@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'Emily',
    lastName: 'Johnson',
    role: 'PROVIDER',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567891',
  },
  {
    email: 'dr.williams@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'Michael',
    lastName: 'Williams',
    role: 'PROVIDER',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567892',
  },
  {
    email: 'nurse.davis@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'Sarah',
    lastName: 'Davis',
    role: 'NURSE',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567893',
  },
  {
    email: 'nurse.brown@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'Jessica',
    lastName: 'Brown',
    role: 'NURSE',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567894',
  },
  {
    email: 'receptionist@healthcare.com',
    password: 'SecurePass123!@#',
    firstName: 'Linda',
    lastName: 'Martinez',
    role: 'RECEPTIONIST',
    userType: 'SERVICE_PROVIDER',
    phone: '+1234567895',
  },
  {
    email: 'alice.brown@email.com',
    password: 'SecurePass123!@#',
    firstName: 'Alice',
    lastName: 'Brown',
    role: 'PATIENT',
    userType: 'CLIENT',
    phone: '+1234567901',
    dateOfBirth: '1990-05-15',
  },
  {
    email: 'bob.davis@email.com',
    password: 'SecurePass123!@#',
    firstName: 'Bob',
    lastName: 'Davis',
    role: 'PATIENT',
    userType: 'CLIENT',
    phone: '+1234567902',
    dateOfBirth: '1985-08-22',
  },
  {
    email: 'carol.wilson@email.com',
    password: 'SecurePass123!@#',
    firstName: 'Carol',
    lastName: 'Wilson',
    role: 'PATIENT',
    userType: 'CLIENT',
    phone: '+1234567903',
    dateOfBirth: '1995-12-10',
  },
  {
    email: 'david.jones@email.com',
    password: 'SecurePass123!@#',
    firstName: 'David',
    lastName: 'Jones',
    role: 'PATIENT',
    userType: 'CLIENT',
    phone: '+1234567904',
    dateOfBirth: '1978-03-18',
  },
  {
    email: 'emma.taylor@email.com',
    password: 'SecurePass123!@#',
    firstName: 'Emma',
    lastName: 'Taylor',
    role: 'PATIENT',
    userType: 'CLIENT',
    phone: '+1234567905',
    dateOfBirth: '2010-07-25',
  },
  {
    email: 'guardian@email.com',
    password: 'SecurePass123!@#',
    firstName: 'Frank',
    lastName: 'Taylor',
    role: 'GUARDIAN',
    userType: 'CLIENT',
    phone: '+1234567910',
  },
];

async function createCognitoUser(userData: UserData): Promise<string> {
  try {
    // Create user
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userData.email,
      UserAttributes: [
        { Name: 'email', Value: userData.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:role', Value: userData.role },
        { Name: 'custom:userType', Value: userData.userType },
      ],
      MessageAction: 'SUPPRESS',
    });

    const response = await cognitoClient.send(createCommand);
    const userId = response.User!.Username!;

    // Set permanent password
    const passwordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userData.email,
      Password: userData.password,
      Permanent: true,
    });

    await cognitoClient.send(passwordCommand);

    console.log(`✅ Created Cognito user: ${userData.email}`);
    return userId;
  } catch (error: any) {
    if (error.name === 'UsernameExistsException') {
      console.log(`⚠️  User already exists: ${userData.email}`);
      // Return a mock UUID for existing users
      return crypto.randomUUID();
    }
    throw error;
  }
}

async function createPatientRecord(patientData: PatientData): Promise<string> {
  try {
    const patientId = crypto.randomUUID();
    
    // Encrypt sensitive data using the shared encryption utility
    const encryptedData = {
      contact_info: await encryption.encryptWithKMS(JSON.stringify(patientData.contact_info)),
      address: await encryption.encryptWithKMS(JSON.stringify(patientData.address)),
      insurance_info: await encryption.encryptWithKMS(JSON.stringify(patientData.insurance_info)),
      medical_history: await encryption.encryptWithKMS(JSON.stringify(patientData.medical_history)),
    };

    const data = {
      id: patientId,
      first_name: patientData.first_name,
      last_name: patientData.last_name,
      date_of_birth: patientData.date_of_birth,
      gender: patientData.gender,
      ...encryptedData,
    };

    await db.beginTransaction();
    try {
      const result = await db.insert('patients', data);
      await db.commit();
      return result.id;
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating patient record:', error);
    throw error;
  }
}

async function seedData() {
  try {
    const userIds = [];
    const patientIds = [];

    // Create test users and store their IDs
    for (const testUser of testUsers) {
      const userId = await createCognitoUser(testUser);
      if (userId) {
        userIds.push(userId);
        console.log(`Created user ${testUser.email} with ID ${userId}`);
      }
    }

    // Create patient records for each user
    for (const testPatient of testPatients) {
      const patientId = await createPatientRecord(testPatient);
      if (patientId) {
        patientIds.push(patientId);
        console.log(`Created patient record for ${testPatient.first_name} ${testPatient.last_name} with ID ${patientId}`);
      }
    }

    console.log('✅ Database seeding completed successfully');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

seedData();