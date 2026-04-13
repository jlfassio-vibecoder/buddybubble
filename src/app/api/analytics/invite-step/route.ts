/**
 * POST /api/analytics/invite-step
 *
 * Public, token-scoped invite funnel analytics. Resolves `token` → workspace via
 * `invitations` (service role) and writes `invite_journey_step`. Invalid tokens
 * return `{ ok: true }` with no insert (no oracle).
 */

import { NextResponse } from 'next/server';
import { INVITE_JOURNEY_STEPS, type InviteJourneyStep } from '@/lib/analytics/invite-journey';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { isPlausibleInviteTokenForCookie } from '@/lib/invite-token';

const STEP_SET = new Set<string>(INVITE_JOURNEY_STEPS);

export async function POST(req: Request) {
  try {
    let body: { token?: unknown; step?: unknown; detail?: unknown };
    try {
      body = (await req.json()) as { token?: unknown; step?: unknown; detail?: unknown };
    } catch {
      return NextResponse.json({ ok: true });
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const stepRaw = typeof body.step === 'string' ? body.step.trim() : '';
    if (!isPlausibleInviteTokenForCookie(token) || !STEP_SET.has(stepRaw)) {
      return NextResponse.json({ ok: true });
    }

    const detail =
      body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
        ? (body.detail as Record<string, unknown>)
        : {};

    await insertInviteJourneyByToken(token, stepRaw as InviteJourneyStep, detail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analytics/invite-step] handler error:', message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
