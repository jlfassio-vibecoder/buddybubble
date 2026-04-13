/**
 * POST /api/billing/analytics
 *
 * Batch-insert client-side billing funnel events (authenticated workspace owner).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { CLIENT_ALLOWED_BILLING_FUNNEL_KEYS } from '@/lib/billing-funnel-event-keys';
import { insertBillingFunnelEvent } from '@/lib/billing-funnel-events';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

type IncomingEvent = {
  eventKey?: string;
  billingAttemptId?: string | null;
  payload?: Record<string, unknown>;
  clientSessionId?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: { workspaceId?: string; events?: IncomingEvent[] };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    if (!workspaceId || !isUuid(workspaceId)) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can record billing analytics' },
        { status: 403 },
      );
    }

    const rawEvents = Array.isArray(body.events) ? body.events : [];
    const events = rawEvents.slice(0, 40);

    let accepted = 0;
    for (const ev of events) {
      const eventKey = typeof ev.eventKey === 'string' ? ev.eventKey.trim() : '';
      if (!eventKey || !CLIENT_ALLOWED_BILLING_FUNNEL_KEYS.has(eventKey)) {
        continue;
      }

      const attempt =
        typeof ev.billingAttemptId === 'string' && isUuid(ev.billingAttemptId)
          ? ev.billingAttemptId
          : null;

      const inserted = await insertBillingFunnelEvent({
        source: 'client',
        eventKey,
        workspaceId,
        userId: user.id,
        billingAttemptId: attempt,
        payload: typeof ev.payload === 'object' && ev.payload !== null ? ev.payload : {},
        clientSessionId:
          typeof ev.clientSessionId === 'string' ? ev.clientSessionId.slice(0, 128) : null,
      });
      if (inserted) accepted += 1;
    }

    return NextResponse.json({ ok: true, accepted });
  } catch (e) {
    console.error('[billing/analytics]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
