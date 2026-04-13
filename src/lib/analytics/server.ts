/**
 * Growth Engine — server-side event tracking.
 *
 * Use `trackServerEvent()` in API routes, server actions, and the Stripe
 * webhook handler. Never import this in client components.
 *
 * Writes directly to `analytics_events` via the service role key so events
 * are never lost to batching or browser unload.
 */

import { createServiceRoleClient } from '@/lib/supabase-service-role';
import type { EventType } from './types';

interface ServerEventFields {
  workspaceId?: string | null;
  userId?: string | null;
  leadId?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write a single analytics event from server-side code.
 * Errors are logged but never thrown — analytics must never break the calling route.
 */
export async function trackServerEvent(
  eventType: EventType,
  fields: ServerEventFields = {},
): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const { error } = await db.from('analytics_events').insert({
      event_type: eventType,
      workspace_id: fields.workspaceId ?? null,
      user_id: fields.userId ?? null,
      lead_id: fields.leadId ?? null,
      path: fields.path ?? null,
      metadata: fields.metadata ?? {},
    });
    if (error) {
      console.error('[analytics/server] insert failed:', error.message);
    }
  } catch (err) {
    console.error('[analytics/server] unexpected error:', err);
  }
}
