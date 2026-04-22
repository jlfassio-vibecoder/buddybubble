/**
 * Storefront Phase 2: private trial bubble + bubble_members (see docs/tdd-lead-onboarding.md).
 * Used only from the service-role storefront-trial API route.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/database';

export const STOREFRONT_LEAD_METADATA_TRIAL_BUBBLE_KEY = 'trial_bubble_id';

/** Service-role client (manual `Database` shape omits generated `Relationships`; use untyped client here). */
type ServiceDb = SupabaseClient;

export function parseTrialBubbleIdFromLeadMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[STOREFRONT_LEAD_METADATA_TRIAL_BUBBLE_KEY];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function trialBubbleNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() || 'lead';
  const short = local.length > 24 ? `${local.slice(0, 24)}…` : local;
  return `Trial · ${short}`;
}

export async function resolveStorefrontCoachUserId(
  db: ServiceDb,
  workspaceId: string,
): Promise<{ coachUserId: string } | { error: string }> {
  const { data: owner, error: ownerErr } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (ownerErr) {
    console.error('[storefront-trial-isolation] owner query', ownerErr);
    return { error: 'Failed to resolve workspace owner' };
  }
  if (owner?.user_id) {
    return { coachUserId: owner.user_id as string };
  }

  const { data: admins, error: adminErr } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true });

  if (adminErr) {
    console.error('[storefront-trial-isolation] admin query', adminErr);
    return { error: 'Failed to resolve workspace admin' };
  }
  const first = admins?.[0]?.user_id as string | undefined;
  if (first) {
    return { coachUserId: first };
  }

  console.error('[storefront-trial-isolation] no owner or admin for workspace', workspaceId);
  return { error: 'Workspace has no owner or admin' };
}

export type ExistingTrialContext = {
  leadId: string;
  trialBubbleId: string;
};

export async function findExistingStorefrontTrial(
  db: ServiceDb,
  workspaceId: string,
  userId: string,
): Promise<ExistingTrialContext | null> {
  const { data: rows, error } = await db
    .from('leads')
    .select('id, metadata')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .in('source', ['storefront_organic', 'storefront_paid'])
    .order('first_seen_at', { ascending: false })
    .limit(5);

  if (error || !rows?.length) {
    if (error) console.error('[storefront-trial-isolation] prior leads query', error);
    return null;
  }

  for (const row of rows) {
    const trialBubbleId = parseTrialBubbleIdFromLeadMetadata(row.metadata);
    if (!trialBubbleId) continue;
    const { data: bubble, error: bErr } = await db
      .from('bubbles')
      .select('id')
      .eq('id', trialBubbleId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (bErr) {
      console.error('[storefront-trial-isolation] bubble verify', bErr);
      continue;
    }
    if (bubble?.id) {
      return { leadId: row.id as string, trialBubbleId };
    }
  }
  return null;
}

export async function createTrialBubbleAndMembers(opts: {
  db: ServiceDb;
  workspaceId: string;
  guestUserId: string;
  coachUserId: string;
  emailForName: string;
}): Promise<{ trialBubbleId: string } | { error: string }> {
  const { db, workspaceId, guestUserId, coachUserId, emailForName } = opts;

  const { data: bubble, error: bubbleErr } = await db
    .from('bubbles')
    .insert({
      workspace_id: workspaceId,
      name: trialBubbleNameFromEmail(emailForName),
      icon: 'Hash',
      is_private: true,
      bubble_type: 'trial',
    })
    .select('id')
    .single();

  if (bubbleErr || !bubble?.id) {
    console.error('[storefront-trial-isolation] bubble insert', bubbleErr);
    return { error: 'Failed to create trial bubble' };
  }

  const trialBubbleId = bubble.id as string;

  // Guest must be `editor` so `can_write_bubble` matches RLS: private bubbles only grant task write
  // to workspace admins/members or explicit bubble editors — `viewer` left the UI read-only while
  // assigned-to-self updates could still succeed, which broke trial UX (TaskModal, Kanban card).
  const { error: bmErr } = await db.from('bubble_members').insert([
    { bubble_id: trialBubbleId, user_id: guestUserId, role: 'editor' },
    { bubble_id: trialBubbleId, user_id: coachUserId, role: 'editor' },
  ]);

  if (bmErr) {
    console.error('[storefront-trial-isolation] bubble_members insert', bmErr);
    await db.from('bubbles').delete().eq('id', trialBubbleId);
    return { error: 'Failed to add trial bubble members' };
  }

  return { trialBubbleId };
}

/**
 * Grant a newly-provisioned `trialing` user access to the Host's configured
 * default community bubbles (backed by `workspace_role_default_bubbles`).
 *
 * Non-fatal: any DB failure is logged and swallowed — the caller must never let
 * a default-bubble failure bounce the whole Storefront Lead intake. The user's
 * 1-to-1 trial bubble (`createTrialBubbleAndMembers`) is the must-have; community
 * bubbles are a best-effort onboarding convenience.
 *
 * Idempotency: we upsert on `(bubble_id, user_id)` with `ignoreDuplicates` so
 *   1. Re-entry on an existing trial does not duplicate rows.
 *   2. If the user already has a higher-privilege grant (`editor`) on one of the
 *      default bubbles from another flow, we do NOT downgrade them to `viewer`.
 *
 * Role choice: `viewer` — trialing users get read + chat via `can_view_bubble`
 * (member-like), but default community bubbles intentionally do not grant task
 * authorship beyond what RLS already allows; the Host's dedicated trial bubble
 * remains the only place the lead is `editor`.
 */
export async function grantStorefrontTrialDefaultBubbles(opts: {
  db: ServiceDb;
  workspaceId: string;
  userId: string;
}): Promise<{ granted: number; attempted: number; errored: boolean }> {
  const { db, workspaceId, userId } = opts;

  try {
    const { data: defaults, error: defErr } = await db
      .from('workspace_role_default_bubbles')
      .select('bubble_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'trialing');

    if (defErr) {
      console.error(
        '[storefront-trial-isolation] default-bubbles query',
        defErr.message || 'Unknown error',
      );
      return { granted: 0, attempted: 0, errored: true };
    }

    const rows = (defaults ?? []) as Array<{ bubble_id: string }>;
    if (rows.length === 0) {
      return { granted: 0, attempted: 0, errored: false };
    }

    const payload = rows.map((r) => ({
      bubble_id: r.bubble_id,
      user_id: userId,
      role: 'viewer' as const,
    }));

    const { data: inserted, error: bmErr } = await db
      .from('bubble_members')
      .upsert(payload, {
        onConflict: 'bubble_id,user_id',
        ignoreDuplicates: true,
      })
      .select('bubble_id');

    if (bmErr) {
      console.error(
        '[storefront-trial-isolation] default bubble_members upsert',
        bmErr.message || 'Unknown error',
        { attempted: payload.length },
      );
      return { granted: 0, attempted: payload.length, errored: true };
    }

    return {
      granted: (inserted ?? []).length,
      attempted: payload.length,
      errored: false,
    };
  } catch (e) {
    console.error(
      '[storefront-trial-isolation] default bubbles grant threw',
      e instanceof Error ? e.message : 'Unknown error',
    );
    return { granted: 0, attempted: 0, errored: true };
  }
}

export function mergeLeadMetadataWithTrialBubble(
  base: Json,
  trialBubbleId: string,
): Record<string, unknown> {
  const obj =
    base && typeof base === 'object' && !Array.isArray(base)
      ? { ...(base as Record<string, unknown>) }
      : {};
  obj[STOREFRONT_LEAD_METADATA_TRIAL_BUBBLE_KEY] = trialBubbleId;
  return obj;
}
