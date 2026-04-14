/**
 * Defense-in-depth filters for workspace guests (storefront trial isolation).
 * Must stay aligned with tasks RLS in supabase/migrations/*guest_tasks_rls*.sql.
 *
 * @see docs/tdd-lead-onboarding.md §5.2
 */

import type { MemberRole } from '@/types/database';

/** PostgREST `.or()` fragment: self-assigned OR unassigned (coach pool in shared trial bubble). */
export function guestTaskAssignmentVisibilityOr(userId: string): string {
  return `assigned_to.eq.${userId},assigned_to.is.null`;
}

export function isGuestWorkspaceRole(role: MemberRole | null | undefined): boolean {
  return role === 'guest';
}
