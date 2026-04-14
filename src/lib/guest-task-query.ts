/**
 * Defense-in-depth filters for workspace guests (storefront trial isolation).
 * Must stay aligned with tasks RLS in supabase/migrations/*guest_tasks_rls*.sql.
 *
 * @see docs/tdd-lead-onboarding.md §5.2
 */

import type { MemberRole } from '@/types/database';

/**
 * PostgREST `.or()` fragment: self-assigned OR unassigned (coach pool in shared trial bubble).
 *
 * **Composition:** Supabase/PostgREST ANDs this with filters applied earlier in the chain. The
 * request looks like `bubble_id=eq.<id>&or=(assigned_to.eq.<uid>,assigned_to.is.null)` (or
 * `bubble_id=in.(...)` for multi-bubble), i.e. `(bubble scope) AND (mine OR unassigned)` — not a
 * top-level OR that drops bubble scope. Always apply `.eq('bubble_id', …)` / `.in('bubble_id', …)`
 * (and other scoping filters) **before** `.or(guestTaskAssignmentVisibilityOr(...))`.
 */
export function guestTaskAssignmentVisibilityOr(userId: string): string {
  return `assigned_to.eq.${userId},assigned_to.is.null`;
}

export function isGuestWorkspaceRole(role: MemberRole | null | undefined): boolean {
  return role === 'guest';
}
