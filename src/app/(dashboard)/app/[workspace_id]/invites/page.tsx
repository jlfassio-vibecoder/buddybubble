import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { InvitesClient } from './invites-client';
import { loadInvitesDataCached } from './load-invites-data';

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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    redirect('/login');
  }

  let pageData;
  try {
    pageData = await loadInvitesDataCached(workspace_id, session.access_token);
  } catch (e) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50 p-4">
        <p className="text-sm text-destructive">
          {e instanceof Error ? e.message : 'Failed to load invites.'}
        </p>
      </div>
    );
  }

  const { workspaceName, showFamilyNames, initialInvites, initialWaitingRows } = pageData;

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
        showFamilyNames={showFamilyNames}
      />
    </Suspense>
  );
}
