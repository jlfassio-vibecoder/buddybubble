import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { inviteUrlForToken } from '@/lib/app-url';
import { normalizeWaitingRoomRows, type WaitingRoomRow } from '@/lib/waiting-room-rows';
import { getSupabasePublishableKey, getSupabaseUrl } from '@utils/supabase/env';
import type { InviteListItem } from './invites-client';

export type InvitesPageData = {
  workspaceName: string;
  showFamilyNames: boolean;
  initialInvites: InviteListItem[];
  initialWaitingRows: WaitingRoomRow[];
};

export function invitesCacheTag(workspaceId: string): string {
  return `workspace-${workspaceId}-invites`;
}

export async function loadInvitesDataCached(
  workspaceId: string,
  token: string,
): Promise<InvitesPageData> {
  const cached = unstable_cache(
    async (): Promise<InvitesPageData> => {
      const url = getSupabaseUrl();
      const key = getSupabasePublishableKey();
      if (!url || !key) {
        throw new Error(
          'Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)',
        );
      }

      const supabase = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .select('name, category_type')
        .eq('id', workspaceId)
        .maybeSingle();
      if (wsErr) throw new Error(wsErr.message);

      const { data: rows, error: invErr } = await supabase
        .from('invitations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (invErr) throw new Error(invErr.message);

      const { data: joinData, error: joinErr } = await supabase
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
      if (joinErr) throw new Error(joinErr.message);

      const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'this socialspace';
      const categoryType = (ws as { category_type?: string } | null)?.category_type;
      const showFamilyNames = categoryType === 'kids' || categoryType === 'community';

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
        workspaceName,
        showFamilyNames,
        initialInvites,
        initialWaitingRows: normalizeWaitingRoomRows(joinData),
      };
    },
    ['workspace-invites-data', workspaceId, 'v1'],
    { tags: [invitesCacheTag(workspaceId)] },
  );

  return cached();
}
