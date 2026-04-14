/**
 * Workspace lead capture analytics.
 *
 * This module is the home for WORKSPACE lead tracking helpers — i.e. analytics
 * for invitees (invite link or storefront soft-trial) attributed to a workspace.
 *
 * It is NOT used for platform (BuddyBubble subscription) lead tracking.
 * Platform funnel events live in `billing_funnel_events` and the
 * `trial_started` / `trial_converted` analytics event types.
 *
 * @see docs/technical-design-dual-lead-capture-workflows-v1.md
 */

import { trackServerEvent } from '@/lib/analytics/server';
import type { LeadRowSource } from '@/lib/leads-source';
import type { Json } from '@/types/database';

export type { InviteLeadSource, LeadRowSource, StorefrontLeadSource } from '@/lib/leads-source';

export type LeadAcquisitionSegment = 'in_person' | 'online';

/** Same rules as `/api/leads/track` — `qr` and `link` invites are in-person; email/SMS/other are online. */
export function acquisitionContextFromInviteType(
  inviteType: string | null | undefined,
): LeadAcquisitionSegment {
  const t = inviteType?.trim().toLowerCase();
  if (t === 'qr' || t === 'link') return 'in_person';
  return 'online';
}

/**
 * Legacy rows without `acquisition_context` are treated as online when no invitation is joined.
 */
export function normalizedAcquisitionContext(
  metadata: Json | null | undefined,
): LeadAcquisitionSegment {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 'online';
  const ac = (metadata as Record<string, unknown>).acquisition_context;
  if (ac === 'in_person') return 'in_person';
  return 'online';
}

/**
 * Prefer `invitations.invite_type` (always correct for how the invite was created). Falls back to
 * `metadata.acquisition_context` for legacy rows or missing invitation rows.
 */
export function resolveLeadSegment(
  metadata: Json | null | undefined,
  inviteTypeFromInvitation: string | null | undefined,
): LeadAcquisitionSegment {
  if (inviteTypeFromInvitation != null && String(inviteTypeFromInvitation).trim() !== '') {
    return acquisitionContextFromInviteType(inviteTypeFromInvitation);
  }
  return normalizedAcquisitionContext(metadata);
}

export function formatUtmParams(utm: Json): string {
  if (!utm || typeof utm !== 'object' || Array.isArray(utm)) return '—';
  const o = utm as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}=${String(v)}`);
  }
  return parts.length ? parts.join(', ') : '—';
}

export function inviteTokenSuffix(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const t = token.trim();
  if (t.length < 8) return null;
  return `…${t.slice(-8)}`;
}

export type LeadCaptureDisplayRow = {
  id: string;
  displayName: string | null;
  email: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  source: string;
  utmSummary: string;
  segment: LeadAcquisitionSegment;
  inviteSuffix: string | null;
  hasLinkedUser: boolean;
};

/**
 * The acquisition context written into the `lead_captured` analytics event
 * metadata for every new workspace lead row.
 *
 * Stored under `metadata.acquisition_context` so downstream queries can
 * filter or segment by source and UTM without scanning the `leads` table.
 */
export interface AcquisitionContext {
  /** Always 'workspace' — tenant-attributed visitor, not a platform prospect. */
  workflow: 'workspace';
  source: LeadRowSource;
  invite_token: string | null;
  utm_params: Record<string, string>;
}

/**
 * Emit a `lead_captured` analytics event when a new workspace lead row is
 * first inserted by `/api/leads/track` or `/api/leads/storefront-trial`.
 *
 * - Server-side only (called from the service-role API route).
 * - Fire-and-forget: errors are swallowed by `trackServerEvent`; analytics
 *   must never block the response.
 * - Never call this for platform acquisition events (trial_started, etc.).
 */
export async function trackWorkspaceLeadCaptured(opts: {
  workspaceId: string;
  leadId: string;
  source: LeadRowSource;
  inviteToken: string | null;
  utmParams: Record<string, string>;
  userId?: string | null;
}): Promise<void> {
  const acquisitionContext: AcquisitionContext = {
    workflow: 'workspace',
    source: opts.source,
    invite_token: opts.inviteToken,
    utm_params: opts.utmParams,
  };

  await trackServerEvent('lead_captured', {
    workspaceId: opts.workspaceId,
    userId: opts.userId ?? null,
    leadId: opts.leadId,
    metadata: {
      workflow: 'workspace',
      source: opts.source,
      invite_token: opts.inviteToken,
      acquisition_context: acquisitionContext,
    },
  });
}
