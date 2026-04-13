/**
 * POST /api/analytics/event
 *
 * Edge-runtime event ingest endpoint. Accepts a batch of analytics events
 * from the browser client and writes them to `analytics_events`.
 *
 * Edge runtime avoids cold-start latency on every page view event.
 * Writes use the Supabase service role key — no direct anon table access.
 *
 * Body: { events: AnalyticsEventPayload[] }
 * Response: { ok: true } | { error: string }
 */

export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { AnalyticsEventPayload, EventType } from '@/lib/analytics/types';

const VALID_EVENT_TYPES = new Set<EventType>([
  'lead_captured',
  'auth_modal_opened',
  'signup_completed',
  'trial_started',
  'trial_converted',
  'trial_canceled',
  'subscription_canceled',
  'subscription_restarted',
  'feature_gate_hit',
  'premium_feature_used',
  'page_view',
  'session_start',
]);

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  let body: { events?: unknown[] };
  try {
    body = (await req.json()) as { events?: unknown[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Validate and normalize each event
  const rows: Record<string, unknown>[] = [];
  for (const raw of rawEvents) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Partial<AnalyticsEventPayload>;
    if (!e.event_type || !VALID_EVENT_TYPES.has(e.event_type as EventType)) continue;

    rows.push({
      event_type: e.event_type,
      workspace_id: typeof e.workspace_id === 'string' ? e.workspace_id : null,
      user_id: typeof e.user_id === 'string' ? e.user_id : null,
      lead_id: typeof e.lead_id === 'string' ? e.lead_id : null,
      session_id: typeof e.session_id === 'string' ? e.session_id : null,
      path: typeof e.path === 'string' ? e.path : null,
      metadata: e.metadata && typeof e.metadata === 'object' ? e.metadata : {},
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    const db = getDb();
    const { error } = await db.from('analytics_events').insert(rows);
    if (error) {
      console.error('[analytics/event] insert failed:', error.message);
      // Return 200 anyway — client should not retry analytics failures
    }
  } catch (err) {
    console.error('[analytics/event] unexpected error:', err);
  }

  return NextResponse.json({ ok: true });
}
