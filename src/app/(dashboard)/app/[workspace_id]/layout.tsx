import { redirect } from 'next/navigation';
import { fetchPendingJoinRequestCountAndPreview } from '@/lib/workspace-join-requests';
import { createClient } from '@utils/supabase/server';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const row = data as { role: string } | null | undefined;
  if (!row) {
    redirect('/app');
  }

  const role = row.role as 'owner' | 'admin' | 'member' | 'guest';

  let initialPendingJoinRequestCount = 0;
  let initialJoinRequestPreview: Awaited<
    ReturnType<typeof fetchPendingJoinRequestCountAndPreview>
  >['preview'] = [];
  if (role === 'admin' || role === 'owner') {
    const jr = await fetchPendingJoinRequestCountAndPreview(supabase, workspace_id);
    initialPendingJoinRequestCount = jr.count;
    initialJoinRequestPreview = jr.preview;
  }

  return (
    <DashboardShell
      workspaceId={workspace_id}
      initialRole={role}
      initialPendingJoinRequestCount={initialPendingJoinRequestCount}
      initialJoinRequestPreview={initialJoinRequestPreview}
    >
      {children}
    </DashboardShell>
  );
}
