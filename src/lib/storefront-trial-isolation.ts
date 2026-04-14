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

  const { error: bmErr } = await db.from('bubble_members').insert([
    { bubble_id: trialBubbleId, user_id: guestUserId, role: 'viewer' },
    { bubble_id: trialBubbleId, user_id: coachUserId, role: 'editor' },
  ]);

  if (bmErr) {
    console.error('[storefront-trial-isolation] bubble_members insert', bmErr);
    await db.from('bubbles').delete().eq('id', trialBubbleId);
    return { error: 'Failed to add trial bubble members' };
  }

  return { trialBubbleId };
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
