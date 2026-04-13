/**
 * Persist billing funnel analytics (server-side, service role).
 *
 * @see docs/technical-design-stripe-dual-mode-and-billing-funnel-analytics-v1.md
 */

import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { billingDeployEnvironment, stripeRuntimeMode } from '@/lib/stripe-runtime';

export { BILLING_FUNNEL_EVENT_KEYS } from '@/lib/billing-funnel-event-keys';

export type BillingFunnelInsert = {
  billingAttemptId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  source: 'client' | 'server';
  eventKey: string;
  payload?: Record<string, unknown>;
  clientSessionId?: string | null;
  /** Stripe webhook event id — unique partial index dedupes retries */
  stripeEventId?: string | null;
};

function safePayload(p: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!p || typeof p !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (out[k] !== undefined) continue;
    if (v === undefined) continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean' || v === null) {
      out[k] = v;
      continue;
    }
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      out[k] = v;
      continue;
    }
    if (t === 'object' && v !== null && !Array.isArray(v)) {
      const nested = safePayload(v as Record<string, unknown>);
      if (Object.keys(nested).length) out[k] = nested;
    }
  }
  return out;
}

/**
 * Best-effort insert; never throws to callers (billing must not fail on analytics).
 * @returns true when the row was inserted or deduped (unique violation), false otherwise.
 */
export async function insertBillingFunnelEvent(row: BillingFunnelInsert): Promise<boolean> {
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from('billing_funnel_events').insert({
      billing_attempt_id: row.billingAttemptId ?? null,
      workspace_id: row.workspaceId ?? null,
      user_id: row.userId ?? null,
      environment: billingDeployEnvironment(),
      stripe_mode: stripeRuntimeMode(),
      source: row.source,
      event_key: row.eventKey,
      payload: safePayload(row.payload),
      client_session_id: row.clientSessionId ?? null,
      stripe_event_id: row.stripeEventId ?? null,
    });

    if (error) {
      if (error.code === '23505') {
        return true;
      }
      console.warn('[billing-funnel] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[billing-funnel] insert exception:', message);
    return false;
  }
}
