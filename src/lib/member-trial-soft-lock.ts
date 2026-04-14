/**
 * Storefront member preview soft-lock (workspace_members.trial_expires_at / onboarding_status).
 * Distinct from workspace Stripe subscription (subscriptionStore).
 *
 * @see docs/tdd-lead-onboarding.md §7
 */

import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import type { WorkspaceRow } from '@/store/workspaceStore';
import type { BubbleRow } from '@/types/database';

/** True after cron marks trial_expired, or if trial_active but wall-clock past trial_expires_at (before cron). */
export function memberPreviewPeriodEnded(ws: WorkspaceRow | null): boolean {
  if (!ws || ws.role !== 'guest') return false;
  if (ws.onboarding_status === 'trial_expired') return true;
  if (ws.onboarding_status === 'trial_active' && ws.trial_expires_at) {
    return new Date(ws.trial_expires_at) < new Date();
  }
  return false;
}

/**
 * Soft-lock Kanban/calendar/workout surfaces: guest whose preview ended while focused on trial-bubble work
 * (or aggregate view when any trial bubble exists in the workspace).
 */
export function shouldSoftLockTrialSurfaces(opts: {
  activeWorkspace: WorkspaceRow | null;
  activeBubble: BubbleRow | null;
  selectedBubbleId: string | null;
  bubbles: BubbleRow[];
}): boolean {
  if (!memberPreviewPeriodEnded(opts.activeWorkspace)) return false;

  const { activeBubble, selectedBubbleId, bubbles } = opts;
  if (!selectedBubbleId) return false;

  if (selectedBubbleId === ALL_BUBBLES_BUBBLE_ID) {
    return bubbles.some((b) => b.bubble_type === 'trial');
  }

  const bubble =
    activeBubble?.id === selectedBubbleId
      ? activeBubble
      : bubbles.find((b) => b.id === selectedBubbleId);
  return bubble?.bubble_type === 'trial';
}

/** Block WorkoutPlayer when the task lives on a trial bubble and preview ended. */
export function shouldBlockWorkoutForExpiredMemberPreview(
  taskBubbleId: string,
  activeWorkspace: WorkspaceRow | null,
  bubbles: BubbleRow[],
): boolean {
  if (!memberPreviewPeriodEnded(activeWorkspace)) return false;
  const b = bubbles.find((x) => x.id === taskBubbleId);
  return b?.bubble_type === 'trial';
}
