import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { findExistingStorefrontTrial } from '@/lib/storefront-trial-isolation';
import { scheduleStorefrontTrialWorkoutAfterResponse } from '@/lib/storefront-trial-job';
import {
  setBubbleWorkoutGenerationStatus,
  trialBubbleNeedsStorefrontWorkout,
} from '@/lib/storefront-trial-workout-task';

export const maxDuration = 300;

/** In-process rate limit (per server instance). */
const retryTimestamps = new Map<string, number[]>();
const RETRY_WINDOW_MS = 60 * 60 * 1000;
const MAX_RETRIES_PER_WINDOW = 5;

function rateLimitHit(userId: string, bubbleId: string): boolean {
  const key = `${userId}:${bubbleId}`;
  const now = Date.now();
  const windowStart = now - RETRY_WINDOW_MS;
  const arr = (retryTimestamps.get(key) ?? []).filter((t) => t > windowStart);
  if (arr.length >= MAX_RETRIES_PER_WINDOW) {
    return true;
  }
  arr.push(now);
  retryTimestamps.set(key, arr);
  return false;
}

type Body = { workspace_id?: string; bubble_id?: string };

/**
 * Re-run async storefront trial workout generation after a failed attempt (guest, trial bubble).
 */
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

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
    const bubbleId = typeof body.bubble_id === 'string' ? body.bubble_id.trim() : '';
    if (!workspaceId || !bubbleId) {
      return NextResponse.json(
        { error: 'workspace_id and bubble_id are required' },
        { status: 400 },
      );
    }

    const { data: membership, error: memErr } = await supabase
      .from('workspace_members')
      .select('role, onboarding_status')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memErr || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }
    if (
      (membership as { role?: string }).role !== 'guest' ||
      (membership as { onboarding_status?: string }).onboarding_status !== 'trial_active'
    ) {
      return NextResponse.json(
        { error: 'Retry is only available for active trial guests' },
        { status: 403 },
      );
    }

    const { data: bubble, error: bErr } = await supabase
      .from('bubbles')
      .select('id, workspace_id, bubble_type')
      .eq('id', bubbleId)
      .maybeSingle();

    if (bErr || !bubble) {
      return NextResponse.json({ error: 'Bubble not found' }, { status: 404 });
    }
    if (
      (bubble as { workspace_id?: string }).workspace_id !== workspaceId ||
      (bubble as { bubble_type?: string }).bubble_type !== 'trial'
    ) {
      return NextResponse.json({ error: 'Invalid trial bubble' }, { status: 403 });
    }

    const { data: bm, error: bmErr } = await supabase
      .from('bubble_members')
      .select('user_id')
      .eq('bubble_id', bubbleId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (bmErr || !bm) {
      return NextResponse.json({ error: 'Not a member of this bubble' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const existing = await findExistingStorefrontTrial(svc, workspaceId, user.id);
    if (!existing || existing.trialBubbleId !== bubbleId) {
      return NextResponse.json(
        { error: 'No storefront trial context for this bubble' },
        { status: 404 },
      );
    }

    if (rateLimitHit(user.id, bubbleId)) {
      return NextResponse.json({ error: 'Too many retries. Try again later.' }, { status: 429 });
    }

    const needs = await trialBubbleNeedsStorefrontWorkout(svc, bubbleId, user.id);
    if (!needs) {
      await setBubbleWorkoutGenerationStatus(svc, bubbleId, 'completed');
      return NextResponse.json({ ok: true, skipped: true });
    }

    await setBubbleWorkoutGenerationStatus(svc, bubbleId, 'pending');
    await scheduleStorefrontTrialWorkoutAfterResponse({
      workspaceId,
      userId: user.id,
      leadId: existing.leadId,
      trialBubbleId: bubbleId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[retry-storefront-trial-workout]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
