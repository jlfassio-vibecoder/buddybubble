/**
 * Subscription-aware permission flags.
 *
 * Pure functions — no Supabase calls. The caller is responsible for fetching
 * `workspace_subscriptions.status` and `workspaces.category_type`, then
 * passing them in.
 *
 * Works alongside the existing `permissions.ts` role-based flags.
 *
 * Free workspace types (community / kids / class) always return full access.
 * Paid workspace types (business / fitness) are gated by subscription status.
 */

import type { WorkspaceCategory } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

// Copilot suggestion ignored: Keep this local union so the UI layer can include `no_subscription` without importing a conflicting generated `SubscriptionStatus` name from `database.ts`.
/** Mirrors the CHECK constraint in `workspace_subscriptions.status`. */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'trial_expired'
  | 'canceled'
  | 'incomplete'
  | 'no_subscription'; // no row exists yet

export interface SubscriptionPermissions {
  /** Use AI generation features (workout builder, personalisation). */
  canUseAI: boolean;
  /** View analytics dashboard. */
  canViewAnalytics: boolean;
  /** Export data to CSV / PDF. */
  canExportData: boolean;
  /** Record new workouts, save cards, create tracking entries. */
  canRecordNewData: boolean;
  /** Apply custom branding / colours to the workspace. */
  canCustomizeBranding: boolean;
  /** Create a new paid workspace (blocked while current workspace is unpaid). */
  canCreatePaidWorkspace: boolean;
  /** Whether this workspace is currently in trial. */
  isTrialing: boolean;
  /** True for both trialing and active — "all premium features available". */
  isPremiumActive: boolean;
  /** True when subscription exists but is degraded (past_due, expired, canceled). */
  requiresUpgrade: boolean;
  /**
   * Effective status exposed to UI for messaging.
   * 'not_required' → free workspace type; no paywall applies.
   */
  subscriptionStatus: SubscriptionStatus | 'not_required';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAID_WORKSPACE_CATEGORIES = new Set<WorkspaceCategory>(['business', 'fitness']);

const FULL_ACCESS: SubscriptionPermissions = {
  canUseAI: true,
  canViewAnalytics: true,
  canExportData: true,
  canRecordNewData: true,
  canCustomizeBranding: true,
  canCreatePaidWorkspace: true,
  isTrialing: false,
  isPremiumActive: true,
  requiresUpgrade: false,
  subscriptionStatus: 'not_required',
};

const NO_ACCESS: Omit<
  SubscriptionPermissions,
  'isTrialing' | 'isPremiumActive' | 'requiresUpgrade' | 'subscriptionStatus'
> = {
  canUseAI: false,
  canViewAnalytics: false,
  canExportData: false,
  canRecordNewData: false,
  canCustomizeBranding: false,
  canCreatePaidWorkspace: false,
};

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve subscription-layer permission flags.
 *
 * @param categoryType  Workspace category (from `workspaces.category_type`).
 * @param status        Current subscription status, or null when no row exists.
 */
// Copilot suggestion ignored: A Vitest matrix was deferred to keep this PR focused; add cases alongside `permissions.test.ts` when subscription edge cases multiply.
export function resolveSubscriptionPermissions(
  categoryType: WorkspaceCategory,
  status: SubscriptionStatus | null,
): SubscriptionPermissions {
  // Community / kids / class — always fully free.
  if (!PAID_WORKSPACE_CATEGORIES.has(categoryType)) {
    return FULL_ACCESS;
  }

  const effectiveStatus: SubscriptionStatus = status ?? 'no_subscription';
  const isPremiumActive = effectiveStatus === 'trialing' || effectiveStatus === 'active';
  const isTrialing = effectiveStatus === 'trialing';

  if (isPremiumActive) {
    return {
      canUseAI: true,
      canViewAnalytics: true,
      canExportData: true,
      canRecordNewData: true,
      canCustomizeBranding: true,
      canCreatePaidWorkspace: true,
      isTrialing,
      isPremiumActive: true,
      requiresUpgrade: false,
      subscriptionStatus: effectiveStatus,
    };
  }

  // Degraded / no subscription — read-only access to existing data only.
  return {
    ...NO_ACCESS,
    isTrialing: false,
    isPremiumActive: false,
    requiresUpgrade: true,
    subscriptionStatus: effectiveStatus,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Whether a workspace category requires a Stripe subscription. */
export function isPaidWorkspaceCategory(categoryType: WorkspaceCategory): boolean {
  return PAID_WORKSPACE_CATEGORIES.has(categoryType);
}

/**
 * UI-friendly label for a subscription status.
 * Used in banners, gates, and settings pages.
 */
export function subscriptionStatusLabel(
  status: SubscriptionPermissions['subscriptionStatus'],
): string {
  switch (status) {
    case 'not_required':
      return 'Free';
    case 'trialing':
      return 'Free Trial';
    case 'active':
      return 'Active';
    case 'past_due':
      return 'Payment Past Due';
    case 'trial_expired':
      return 'Trial Expired';
    case 'canceled':
      return 'Canceled';
    case 'incomplete':
      return 'Setup Incomplete';
    case 'no_subscription':
      return 'No Subscription';
  }
}
