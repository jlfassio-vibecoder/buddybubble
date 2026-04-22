/**
 * Workspace guest helpers (storefront trial isolation).
 *
 * Guest-visible tasks are enforced by `tasks_select` RLS (`public.is_workspace_guest` +
 * `task_assignees` / unassigned rules in `20260624120000_live_session_deck_and_task_assignees.sql`).
 * Do **not** add client-side `.or(...)` filters on removed `tasks.assigned_to` — PostgREST will 400.
 *
 * @see docs/tdd-lead-onboarding.md §5.2
 */

import type { MemberRole } from '@/types/database';

export function isGuestWorkspaceRole(role: MemberRole | null | undefined): boolean {
  return role === 'guest';
}
