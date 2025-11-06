import { AppSyncResolverHandler, AppSyncResolverEvent } from 'aws-lambda';
import { 
  db, 
  Appointment,
  AppointmentFilter,
  TimeSlot,
  PaginatedResponse,
  AppSyncIdentity,
  Timestamps
} from '@healthcare/shared';
import * as crypto from 'crypto';

interface AppointmentArguments {
  id?: string;
  input?: Omit<Appointment, 'id' | keyof Timestamps>;
  filter?: AppointmentFilter;
  limit?: number;
  nextToken?: string;
  providerId?: string;
  date?: string;
  reason?: string;
}

type AppointmentResult = 
  | Appointment 
  | PaginatedResponse<Appointment>
  | TimeSlot[];

export const handler: AppSyncResolverHandler<AppointmentArguments, AppointmentResult> = async (event) => {
  console.log('Appointment Service Event:', JSON.stringify(event, null, 2));

  const { info: { fieldName }, arguments: args } = event;
  const identity = event.identity as { sub: string; 'custom:role'?: string } | null;

  try {
    if (!identity?.sub) {
      throw new Error('Unauthorized');
    }

    switch (fieldName) {
      case 'getAppointment':
        if (!args.id) throw new Error('Appointment ID is required');
        return await getAppointment(args.id, identity);
      
      case 'listAppointments':
        return await listAppointments(
          args.filter ?? {},
          args.limit ?? 20,
          args.nextToken ?? null,
          identity
        );
      
      case 'getAvailableSlots':
        if (!args.providerId || !args.date) {
          throw new Error('Provider ID and date are required');
        }
        return await getAvailableSlots(args.providerId, args.date, identity);
      
      case 'createAppointment':
        if (!args.input) throw new Error('Appointment input is required');
        return await createAppointment(args.input, identity);
      
      case 'updateAppointment':
        if (!args.id || !args.input) {
          throw new Error('Appointment ID and input are required');
        }
        return await updateAppointment(args.id, args.input, identity);
      
      case 'cancelAppointment':
        if (!args.id || !args.reason) {
          throw new Error('Appointment ID and reason are required');
        }
        return await cancelAppointment(args.id, args.reason, identity);
      
      case 'confirmAppointment':
        if (!args.id) throw new Error('Appointment ID is required');
        return await confirmAppointment(args.id, identity);
      
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error('Appointment Service Error:', error);
    throw error;
  }
};

async function getAppointment(id: string, identity: any) {
  const userId = identity.sub;
  const userRole = identity['custom:role'];

  const appointment = await db.queryOne(
    `SELECT a.*, 
            p.mrn, p.user_id as patient_user_id,
            pu.first_name as patient_first_name, pu.last_name as patient_last_name,
            prov.first_name as provider_first_name, prov.last_name as provider_last_name
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.id
     LEFT JOIN users pu ON p.user_id = pu.id
     LEFT JOIN users prov ON a.provider_id = prov.id
     WHERE a.id = :appointmentId`,
    [id]
  );

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  // Authorization check
  if (
    userRole === 'PATIENT' &&
    (appointment as any).patient_user_id !== userId
  ) {
    throw new Error('Access denied to appointment');
  }

  // Log access
  await logHipaaEvent({
    userId: userId,
    action: 'APPOINTMENT_ACCESSED',
    resource: 'appointment',
    resourceId: id,
    phiAccessed: true,
  });

  return formatAppointment(appointment);
}

async function listAppointments(filter: any, limit: number = 20, nextToken: string | null, identity: any) {
  const userId = identity.sub;
  const userRole = identity['custom:role'];

  let query = `SELECT a.*, 
                      p.mrn, p.user_id as patient_user_id,
                      pu.first_name as patient_first_name, pu.last_name as patient_last_name,
                      prov.first_name as provider_first_name, prov.last_name as provider_last_name
               FROM appointments a
               LEFT JOIN patients p ON a.patient_id = p.id
               LEFT JOIN users pu ON p.user_id = pu.id
               LEFT JOIN users prov ON a.provider_id = prov.id
               WHERE 1=1`;
  
  const params: any[] = [];
  let paramIndex = 0;

  // Apply role-based filters
  if (userRole === 'PATIENT') {
    query += ` AND p.user_id = :param${paramIndex}`;
    params.push(userId);
    paramIndex++;
  } else if (userRole === 'PROVIDER' && !filter?.patientId) {
    query += ` AND a.provider_id = :param${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  // Apply additional filters
  if (filter?.patientId) {
    query += ` AND a.patient_id = :param${paramIndex}`;
    params.push(filter.patientId);
    paramIndex++;
  }

  if (filter?.providerId) {
    query += ` AND a.provider_id = :param${paramIndex}`;
    params.push(filter.providerId);
    paramIndex++;
  }

  if (filter?.status) {
    query += ` AND a.status = :param${paramIndex}`;
    params.push(filter.status);
    paramIndex++;
  }

  if (filter?.startDate) {
    query += ` AND a.appointment_date >= :param${paramIndex}`;
    params.push(filter.startDate);
    paramIndex++;
  }

  if (filter?.endDate) {
    query += ` AND a.appointment_date <= :param${paramIndex}`;
    params.push(filter.endDate);
    paramIndex++;
  }

  query += ` ORDER BY a.appointment_date ASC LIMIT ${limit}`;

  const appointments = await db.query(query, params);

  return {
    items: appointments.rows.map(formatAppointment),
    total: appointments.rowCount,
    nextToken: undefined,
  };
}

async function getAvailableSlots(providerId: string, date: string, identity: any) {
  // Get provider's working hours (9 AM - 5 PM for simplicity)
  const startHour = 9;
  const endHour = 17;
  const slotDuration = 30; // minutes

  // Get existing appointments for the provider on that date
  const existingAppointments = await db.query(
    `SELECT appointment_date, duration 
     FROM appointments 
     WHERE provider_id = :providerId 
       AND DATE(appointment_date) = :date
       AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
    [providerId, date]
  );

  const slots: any[] = [];
  const bookedTimes = new Set(
    existingAppointments.rows.map((a: any) => new Date(a.appointment_date).toISOString())
  );

  // Generate time slots
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotDuration) {
      const slotTime = new Date(`${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`);
      const endTime = new Date(slotTime.getTime() + slotDuration * 60000);

      slots.push({
        startTime: slotTime.toISOString(),
        endTime: endTime.toISOString(),
        available: !bookedTimes.has(slotTime.toISOString()),
      });
    }
  }

  return slots;
}

async function createAppointment(input: any, identity: any) {
  const userId = identity.sub;
  const userRole = identity['custom:role'];

  // Validate patient exists
  const patient = await db.queryOne(
    'SELECT * FROM patients WHERE id = :patientId',
    [input.patientId]
  );

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Authorization check
  if (userRole === 'PATIENT' && (patient as any).user_id !== userId) {
    throw new Error('Cannot create appointment for another patient');
  }

  // Check if slot is available
  const conflictingAppointment = await db.queryOne(
    `SELECT id FROM appointments 
     WHERE provider_id = :providerId 
       AND appointment_date = :appointmentDate
       AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
    [input.providerId, input.appointmentDate]
  );

  if (conflictingAppointment) {
    throw new Error('Time slot is not available');
  }

  const appointmentId = crypto.randomUUID();

  const appointment = await db.insert('appointments', {
    id: appointmentId,
    patient_id: input.patientId,
    provider_id: input.providerId,
    appointment_date: input.appointmentDate,
    duration: input.duration,
    type: input.type,
    status: 'SCHEDULED',
    reason: input.reason,
    notes: input.notes,
    location: input.location,
    is_virtual: input.isVirtual || false,
    reminder_sent: false,
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'APPOINTMENT_CREATED',
    resource: 'appointment',
    resourceId: appointmentId,
    phiAccessed: true,
  });

  return formatAppointment(appointment);
}

async function updateAppointment(id: string, input: any, identity: any) {
  const userId = identity.sub;
  const userRole = identity['custom:role'];

  const existing = await db.queryOne(
    `SELECT a.*, p.user_id as patient_user_id
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.id
     WHERE a.id = :appointmentId`,
    [id]
  );

  if (!existing) {
    throw new Error('Appointment not found');
  }

  // Authorization check
  if (
    userRole === 'PATIENT' &&
    (existing as any).patient_user_id !== userId
  ) {
    throw new Error('Access denied to update appointment');
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  if (input.appointmentDate) updateData.appointment_date = input.appointmentDate;
  if (input.duration) updateData.duration = input.duration;
  if (input.type) updateData.type = input.type;
  if (input.status) updateData.status = input.status;
  if (input.reason) updateData.reason = input.reason;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.location) updateData.location = input.location;

  const appointment = await db.update('appointments', id, updateData);

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'APPOINTMENT_UPDATED',
    resource: 'appointment',
    resourceId: id,
    phiAccessed: true,
  });

  return formatAppointment(appointment);
}

async function cancelAppointment(id: string, reason: string, identity: any) {
  const userId = identity.sub;

  const appointment = await db.update('appointments', id, {
    status: 'CANCELLED',
    cancellation_reason: reason,
    cancelled_by: userId,
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'APPOINTMENT_CANCELLED',
    resource: 'appointment',
    resourceId: id,
    phiAccessed: true,
  });

  return formatAppointment(appointment);
}

async function confirmAppointment(id: string, identity: any) {
  const userId = identity.sub;

  const appointment = await db.update('appointments', id, {
    status: 'CONFIRMED',
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });

  // Log HIPAA event
  await logHipaaEvent({
    userId: userId,
    action: 'APPOINTMENT_CONFIRMED',
    resource: 'appointment',
    resourceId: id,
    phiAccessed: true,
  });

  return formatAppointment(appointment);
}

function formatAppointment(appointment: any) {
  return {
    id: appointment.id,
    patientId: appointment.patient_id,
    providerId: appointment.provider_id,
    appointmentDate: appointment.appointment_date,
    duration: appointment.duration,
    type: appointment.type,
    status: appointment.status,
    reason: appointment.reason,
    notes: appointment.notes,
    location: appointment.location,
    isVirtual: appointment.is_virtual,
    reminderSent: appointment.reminder_sent,
    createdAt: appointment.created_at,
    updatedAt: appointment.updated_at,
  };
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