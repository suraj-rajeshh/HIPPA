// Input types
export interface AppointmentInput {
  patientId: string;
  providerId: string;
  appointmentDate: string;
  duration: number;
  type: string;
  reason?: string;
  notes?: string;
  location?: string;
  isVirtual?: boolean;
}

export interface AppointmentFilter {
  patientId?: string;
  providerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

// Return types
export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  appointmentDate: string;
  duration: number;
  type: string;
  status: string;
  reason?: string;
  notes?: string;
  location?: string;
  isVirtual: boolean;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface AppointmentConnection {
  items: Appointment[];
  nextToken: string | null;
}

// Arguments type for the resolver
export interface AppointmentArguments {
  id?: string;
  input?: AppointmentInput;
  filter?: AppointmentFilter;
  limit?: number;
  nextToken?: string;
  providerId?: string;
  date?: string;
  reason?: string;
}

// Union of all possible return types
export type AppointmentResult = 
  | Appointment 
  | AppointmentConnection 
  | TimeSlot[];