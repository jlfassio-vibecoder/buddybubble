import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { fetchPendingJoinRequestCountAndPreview } from '@/lib/workspace-join-requests';
import { parseMemberRole } from '@/lib/permissions';
import { createClient } from '@utils/supabase/server';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

/** Placeholder while `DashboardShell` (uses `useSearchParams`) resolves — avoids SSR/client tree skew and useId mismatches. */
function DashboardRouteFallback() {
  return (
    <div
      className="flex h-screen min-h-0 flex-col bg-background md:flex-row md:overflow-hidden"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="min-h-0 min-w-0 flex-1 animate-pulse bg-muted/25" />
    </div>
  );
}

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

  const role = parseMemberRole(row.role);

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
    <Suspense fallback={<DashboardRouteFallback />}>
      <DashboardShell
        workspaceId={workspace_id}
        initialRole={role}
        initialPendingJoinRequestCount={initialPendingJoinRequestCount}
        initialJoinRequestPreview={initialJoinRequestPreview}
      >
        {children}
      </DashboardShell>
    </Suspense>
  );
}
