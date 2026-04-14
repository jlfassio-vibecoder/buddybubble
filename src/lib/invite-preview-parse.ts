export type InvitePreviewOk = {
  valid: true;
  /** Present for valid invites so `/api/leads/track` can attribute visits (business/fitness). */
  workspace_id: string;
  workspace_name: string;
  category_type: string;
  host_name: string;
  requires_approval: boolean;
  /** From `invitations.invite_type` (e.g. `qr`, `link`). Defaults to `link` if RPC predates column. */
  invite_type: string;
  max_uses: number;
};

export type InvitePreviewErr = {
  valid: false;
  error: string;
};

export type InvitePreviewPayload = InvitePreviewOk | InvitePreviewErr;

export function parseInvitePreviewRpc(raw: unknown): InvitePreviewPayload {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'unknown' };
  }
  const o = raw as Record<string, unknown>;
  if (o.valid === true) {
    const maxUsesRaw = o.max_uses;
    const maxUses =
      typeof maxUsesRaw === 'number' && Number.isFinite(maxUsesRaw)
        ? maxUsesRaw
        : typeof maxUsesRaw === 'string'
          ? parseInt(maxUsesRaw, 10) || 1
          : 1;
    return {
      valid: true,
      workspace_id: String(o.workspace_id ?? ''),
      workspace_name: String(o.workspace_name ?? ''),
      category_type: String(o.category_type ?? 'business'),
      host_name: String(o.host_name ?? 'Host'),
      requires_approval: Boolean(o.requires_approval),
      invite_type:
        typeof o.invite_type === 'string' && o.invite_type.trim() ? o.invite_type.trim() : 'link',
      max_uses: maxUses,
    };
  }
  return { valid: false, error: String(o.error ?? 'unknown') };
}

export function invitePreviewUserMessage(error: string): { title: string; body: string } {
  switch (error) {
    case 'invalid_token':
    case 'not_found':
      return {
        title: 'Invite not found',
        body: 'This link is not valid. Ask the host for a new invite.',
      };
    case 'revoked':
      return { title: 'Invite revoked', body: 'This invite is no longer active.' };
    case 'expired':
      return {
        title: 'Invite expired',
        body: 'This invitation has expired or is invalid. Ask the host for a new invite.',
      };
    case 'depleted':
      return {
        title: 'Invite no longer available',
        body: 'This invite has reached its use limit.',
      };
    default:
      return {
        title: 'Invite unavailable',
        body: 'This invite cannot be used right now.',
      };
  }
}
