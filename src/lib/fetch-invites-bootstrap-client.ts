import { inviteUrlForToken } from '@/lib/app-url';
import { normalizeWaitingRoomRows, type WaitingRoomRow } from '@/lib/waiting-room-rows';
import type { InviteListItem } from '@/app/(dashboard)/app/[workspace_id]/invites/invites-client';
import type { SupabaseClient } from '@supabase/supabase-js';

export type InvitesBootstrapOk = {
  ok: true;
  workspaceName: string;
  initialInvites: InviteListItem[];
  initialWaitingRows: WaitingRoomRow[];
  currentUserId: string;
  callerRole: 'owner' | 'admin';
};

export type InvitesBootstrapErr = {
  ok: false;
  reason: 'not_signed_in' | 'not_member' | 'forbidden' | 'load_error';
  message?: string;
};

export type InvitesBootstrapResult = InvitesBootstrapOk | InvitesBootstrapErr;

/**
 * Client-side bootstrap for People & invites (mirrors `invites/page.tsx` queries; RLS applies).
 */
export async function fetchInvitesBootstrapClient(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<InvitesBootstrapResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: 'not_signed_in' };
  }

  const { data: mem } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (mem as { role?: string } | null)?.role;
  if (!role) {
    return { ok: false, reason: 'not_member' };
  }
  if (role !== 'admin' && role !== 'owner') {
    return { ok: false, reason: 'forbidden' };
  }

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle();

  const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'this workspace';

  const { data: rows, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, reason: 'load_error', message: error.message };
  }

  const { data: joinData, error: joinError } = await supabase
    .from('invitation_join_requests')
    .select(
      `
      id,
      created_at,
      invitation_id,
      user_id,
      users ( full_name, email ),
      invitations ( label, invite_type, max_uses, uses_count )
    `,
    )
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (joinError) {
    return { ok: false, reason: 'load_error', message: joinError.message };
  }

  const initialWaitingRows = normalizeWaitingRoomRows(joinData);

  const initialInvites: InviteListItem[] = (rows ?? []).map((r) => {
    const row = r as {
      id: string;
      token: string;
      invite_type: string;
      label: string | null;
      max_uses: number;
      uses_count: number;
      expires_at: string;
      revoked_at: string | null;
      target_identity: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      token: row.token,
      invite_type: row.invite_type,
      label: row.label,
      max_uses: row.max_uses,
      uses_count: row.uses_count,
      expires_at: row.expires_at,
      revoked_at: row.revoked_at,
      target_identity: row.target_identity,
      created_at: row.created_at,
      inviteUrl: inviteUrlForToken(row.token),
    };
  });

  return {
    ok: true,
    workspaceName,
    initialInvites,
    initialWaitingRows,
    currentUserId: user.id,
    callerRole: role as 'owner' | 'admin',
  };
}
