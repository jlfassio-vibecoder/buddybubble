import type { Json } from '@/types/database';

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
