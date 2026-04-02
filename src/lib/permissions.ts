import { UserRole } from '../types';

export const PERMISSIONS = {
  DELETE_TASK: ['Admin'],
  ASSIGN_TASK: ['Admin', 'Lead'],
  EDIT_TASK: ['Admin', 'Lead', 'Member'],
  CREATE_TASK: ['Admin', 'Lead', 'Member'],
  MANAGE_CHANNELS: ['Admin', 'Lead'],
} as const;

export function hasPermission(role: UserRole | undefined, action: keyof typeof PERMISSIONS): boolean {
  if (!role) return false;
  return (PERMISSIONS[action] as readonly string[]).includes(role);
}
