import 'server-only';

/**
 * Server-side workspace tier resolution for System Analytics gating.
 * Mirrors `workspace_has_system_analytics_access()` via stripe_plan_catalog lookup.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StripePlanKey } from '@/lib/stripe-plans';
import { STRIPE_PLAN_KEYS } from '@/lib/stripe-plans';
import type { SubscriptionStatus } from '@/lib/subscription-permissions';

export const SYSTEM_ANALYTICS_PLAN_KEYS = ['studio', 'studio_pro', 'coach_pro'] as const;

export type SystemAnalyticsPlanKey = (typeof SYSTEM_ANALYTICS_PLAN_KEYS)[number];

export type WorkspaceTierInfo = {
  planKey: StripePlanKey | null;
  status: SubscriptionStatus;
  hasSystemAnalytics: boolean;
  isPremiumActive: boolean;
};

const SYSTEM_ANALYTICS_PLAN_KEY_SET = new Set<string>(SYSTEM_ANALYTICS_PLAN_KEYS);

function parsePlanKey(raw: string | null | undefined): StripePlanKey | null {
  if (!raw) return null;
  return STRIPE_PLAN_KEYS.includes(raw as StripePlanKey) ? (raw as StripePlanKey) : null;
}

/** Pure tier computation — used by tests and getWorkspaceTier. */
export function computeWorkspaceTierInfo(
  status: SubscriptionStatus | null,
  planKey: StripePlanKey | null,
): WorkspaceTierInfo {
  const effectiveStatus: SubscriptionStatus = status ?? 'no_subscription';
  const isPremiumActive = effectiveStatus === 'trialing' || effectiveStatus === 'active';
  const hasSystemAnalytics =
    isPremiumActive && planKey !== null && SYSTEM_ANALYTICS_PLAN_KEY_SET.has(planKey);
  return {
    planKey,
    status: effectiveStatus,
    isPremiumActive,
    hasSystemAnalytics,
  };
}

export async function getWorkspaceTier(
  workspaceId: string,
  supabase: SupabaseClient,
): Promise<WorkspaceTierInfo> {
  const { data: sub } = await supabase
    .from('workspace_subscriptions')
    .select('stripe_product_id, status')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!sub) {
    return computeWorkspaceTierInfo(null, null);
  }

  const status = sub.status as SubscriptionStatus;
  let planKey: StripePlanKey | null = null;

  if (sub.stripe_product_id) {
    const { data: catalog } = await supabase
      .from('stripe_plan_catalog')
      .select('plan_key')
      .eq('stripe_product_id', sub.stripe_product_id)
      .maybeSingle();
    planKey = parsePlanKey((catalog as { plan_key?: string } | null)?.plan_key);
  }

  return computeWorkspaceTierInfo(status, planKey);
}
