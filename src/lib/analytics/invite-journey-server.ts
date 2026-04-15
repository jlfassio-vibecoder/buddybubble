import { createServiceRoleClient } from '@/lib/supabase-service-role';
import type { InviteJourneyStep } from '@/lib/analytics/invite-journey';

export function sanitizeInviteJourneyDetail(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k.length > 64) continue;
    const t = typeof v;
    if (t === 'string') {
      out[k] = (v as string).slice(0, 500);
      continue;
    }
    if (t === 'number' || t === 'boolean' || v === null) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Resolve `token` to a workspace row and insert `invite_journey_step`.
 * Best-effort; never throws.
 */
export async function insertInviteJourneyByToken(
  token: string,
  step: InviteJourneyStep,
  detail: Record<string, unknown> = {},
  options?: { userId?: string | null },
): Promise<void> {
  const t = token.trim();
  if (!t) return;

  try {
    const db = createServiceRoleClient();
    const { data: inv } = await db
      .from('invitations')
      .select('id, workspace_id, invite_type')
      .eq('token', t)
      .maybeSingle();

    const workspaceId = (inv as { workspace_id?: string } | null)?.workspace_id;
    if (!workspaceId) return;

    const invitationId = (inv as { id?: string } | null)?.id ?? null;
    const inviteChannel = (inv as { invite_type?: string } | null)?.invite_type ?? null;

    const { error } = await db.from('analytics_events').insert({
      event_type: 'invite_journey_step',
      workspace_id: workspaceId,
      user_id: options?.userId ?? null,
      metadata: {
        step,
        invitation_id: invitationId,
        invite_channel: inviteChannel,
        ...sanitizeInviteJourneyDetail(detail),
      },
    });
    if (error) {
      console.error('[invite-journey] insert failed:', error.message);
    }
  } catch (e) {
    console.error('[invite-journey] insert exception:', e);
  }
}

/**
 * Post-invite funnel steps after the invite cookie is cleared: attributes by `workspace_id`
 * and verifies the user is still a member (service role read) before insert.
 * Best-effort; never throws.
 */
export async function insertInviteJourneyForWorkspaceMember(
  workspaceId: string,
  userId: string,
  step: InviteJourneyStep,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const ws = workspaceId.trim();
  const uid = userId.trim();
  if (!ws || !uid) return;

  try {
    const db = createServiceRoleClient();
    const { data: mem } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', ws)
      .eq('user_id', uid)
      .maybeSingle();
    if (!mem) return;

    const { error } = await db.from('analytics_events').insert({
      event_type: 'invite_journey_step',
      workspace_id: ws,
      user_id: uid,
      metadata: {
        step,
        invitation_id: null,
        invite_channel: null,
        ...sanitizeInviteJourneyDetail(detail),
      },
    });
    if (error) {
      console.error('[invite-journey] workspace-member insert failed:', error.message);
    }
  } catch (e) {
    console.error('[invite-journey] workspace-member insert exception:', e);
  }
}
