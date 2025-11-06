import { UserRole, UserType } from '../types';

export const STAFF_ROLES = [
  UserRole.ADMIN,
  UserRole.PROVIDER,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.STAFF
] as const;

export const CLIENT_ROLES = [
  UserRole.PATIENT,
  UserRole.GUARDIAN
] as const;

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role as any);
}

export function isClientRole(role: UserRole): boolean {
  return CLIENT_ROLES.includes(role as any);
}

export function validateUserRoleAndType(role: UserRole, userType: UserType): boolean {
  if (isStaffRole(role) && userType !== UserType.SERVICE_PROVIDER) {
    return false;
  }
  if (role === UserRole.PATIENT && userType !== UserType.CLIENT) {
    return false;
  }
  if (role === UserRole.GUARDIAN && userType !== UserType.GUARDIAN) {
    return false;
  }
  return true;
}