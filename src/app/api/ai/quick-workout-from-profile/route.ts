import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { canWriteBubble, parseMemberRole } from '@/lib/permissions';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { insertWorkoutTaskFromStorefrontPreview } from '@/lib/storefront-trial-workout-task';
import { runStorefrontPreviewGeneration } from '@/lib/workout-factory/storefront-preview-runner';
import type { BubbleMemberRole, FitnessProfileRow } from '@/types/database';

export const maxDuration = 90;

const quickGenTimestamps = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 12;

function rateLimitHit(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const arr = (quickGenTimestamps.get(userId) ?? []).filter((t) => t > windowStart);
  if (arr.length >= MAX_PER_WINDOW) return true;
  arr.push(now);
  quickGenTimestamps.set(userId, arr);
  return false;
}

type Body = { workspace_id?: string; bubble_id?: string };

/**
 * Authenticated: one Vertex storefront-style preview from `fitness_profiles`, then insert a
 * workout card on the chosen bubble (assigned to the caller). Same generator path as storefront
 * trial / `runStorefrontTrialWorkoutJob`, without the multi-step card workflow.
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
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memErr || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .select('category_type')
      .eq('id', workspaceId)
      .maybeSingle();

    if (wsErr || !ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    if ((ws as { category_type?: string }).category_type !== 'fitness') {
      return NextResponse.json(
        { error: 'Quick workout is only available in fitness workspaces' },
        { status: 400 },
      );
    }

    const { data: bubble, error: bErr } = await supabase
      .from('bubbles')
      .select('id, workspace_id, is_private')
      .eq('id', bubbleId)
      .maybeSingle();

    if (bErr || !bubble) {
      return NextResponse.json({ error: 'Bubble not found' }, { status: 404 });
    }
    if ((bubble as { workspace_id?: string }).workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: 'Bubble does not belong to this workspace' },
        { status: 400 },
      );
    }

    const { data: bm, error: bmErr } = await supabase
      .from('bubble_members')
      .select('user_id, role')
      .eq('bubble_id', bubbleId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (bmErr || !bm) {
      return NextResponse.json({ error: 'Not a member of this bubble' }, { status: 403 });
    }

    const workspaceRole = parseMemberRole((membership as { role?: string | null }).role);
    const bubbleMemberRole = (bm as { role: BubbleMemberRole }).role;
    const bubblePrivate = Boolean((bubble as { is_private?: boolean }).is_private);
    if (!canWriteBubble(workspaceRole, bubbleMemberRole, bubblePrivate)) {
      return NextResponse.json(
        { error: 'You do not have permission to create tasks in this bubble' },
        { status: 403 },
      );
    }

    if (rateLimitHit(user.id)) {
      return NextResponse.json(
        { error: 'Too many quick workouts. Try again later.' },
        { status: 429 },
      );
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('fitness_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[quick-workout-from-profile] fitness_profiles', profileError);
      return NextResponse.json({ error: 'Could not load fitness profile' }, { status: 500 });
    }

    const profile = profileRow as FitnessProfileRow | null;
    const profileForPreview: unknown = profile ?? {};

    const preview = await runStorefrontPreviewGeneration(profileForPreview);
    if (!preview.ok) {
      const errText = await preview.response.text().catch(() => '');
      let message = 'Preview generation failed';
      try {
        const j = JSON.parse(errText) as { error?: string };
        if (typeof j?.error === 'string') message = j.error;
      } catch {
        // keep default
      }
      return NextResponse.json({ error: message }, { status: preview.response.status || 502 });
    }

    console.log('[DEBUG] Fetching tasks with updated multi-assignee filter. User ID:', user.id);
    const svc = createServiceRoleClient();
    const inserted = await insertWorkoutTaskFromStorefrontPreview(svc, {
      bubbleId,
      userId: user.id,
      workspaceId,
      preview: preview.preview,
    });

    if (!inserted) {
      return NextResponse.json({ error: 'Could not save workout card' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, title: preview.preview.title });
  } catch (e) {
    console.error('[quick-workout-from-profile]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
