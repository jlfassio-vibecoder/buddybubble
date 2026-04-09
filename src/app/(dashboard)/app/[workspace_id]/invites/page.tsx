import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { inviteUrlForToken } from '@/lib/app-url';
import { normalizeWaitingRoomRows } from '@/lib/waiting-room-rows';
import { createClient } from '@utils/supabase/server';
import { InvitesClient, type InviteListItem } from './invites-client';

export default async function InvitesPage({
  params,
}: {
  params: Promise<{ workspace_id: string }>;
}) {
  const { workspace_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: mem } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (mem as { role?: string } | null)?.role;
  if (!role) {
    redirect('/app');
  }
  if (role !== 'admin' && role !== 'owner') {
    redirect(`/app/${workspace_id}`);
  }

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspace_id)
    .maybeSingle();

  const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'this workspace';

  const { data: rows, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('workspace_id', workspace_id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50 p-4">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
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
    .eq('workspace_id', workspace_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (joinError) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50 p-4">
        <p className="text-sm text-destructive">{joinError.message}</p>
      </div>
    );
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

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50 p-4 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <InvitesClient
        workspaceId={workspace_id}
        workspaceName={workspaceName}
        initialInvites={initialInvites}
        initialWaitingRows={initialWaitingRows}
        currentUserId={user.id}
        callerRole={role as 'owner' | 'admin'}
      />
    </Suspense>
  );
}
