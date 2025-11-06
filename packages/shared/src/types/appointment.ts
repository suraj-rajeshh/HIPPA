import { Timestamps } from './common';

export interface Appointment extends Timestamps {
  id: string;
  patientId: string;
  providerId: string;
  appointmentDate: string;
  duration: number;
  type: string;
  status: string;
  notes?: string;
}

export interface AppointmentFilter {
  patientId?: string;
  providerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface AppointmentConnection {
  items: Appointment[];
  nextToken?: string;
  total: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  total: number;
}