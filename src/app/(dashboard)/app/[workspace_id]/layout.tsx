import { Suspense, type CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { fetchPendingJoinRequestCountAndPreview } from '@/lib/workspace-join-requests';
import { parseMemberRole } from '@/lib/permissions';
import { createClient } from '@utils/supabase/server';
import { WorkspaceShellGate } from '@/components/dashboard/workspace-shell-gate';
import { getThemeVariables } from '@/lib/theme-engine/merge';
import { coerceWorkspaceCategory } from '@/lib/theme-engine/resolve-workspace-category';
import type { WorkspaceCategory } from '@/types/database';
import { loadBubblesDataCached, type BubblesPageData } from './load-bubbles-data';

/** Placeholder while `DashboardShell` (uses `useSearchParams`) resolves — avoids SSR/client tree skew and useId mismatches. */
function DashboardRouteFallback({ category }: { category: WorkspaceCategory | null }) {
  const style = getThemeVariables(category ?? 'business', false) as CSSProperties;
  return (
    <div
      className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-background md:flex-row"
      style={style}
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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    redirect('/login');
  }

  const { data: workspaceRow } = await supabase
    .from('workspaces')
    .select('category_type')
    .eq('id', workspace_id)
    .maybeSingle();
  const initialCategoryType = coerceWorkspaceCategory(
    (workspaceRow as { category_type?: string } | null)?.category_type,
  );

  let initialBubbles: BubblesPageData['initialBubbles'] = [];
  try {
    ({ initialBubbles } = await loadBubblesDataCached(workspace_id, user.id, session.access_token));
  } catch {
    // Non-fatal: shell will fall back to its existing client-side fetch.
    initialBubbles = [];
  }

  return (
    <Suspense fallback={<DashboardRouteFallback category={initialCategoryType} />}>
      <WorkspaceShellGate
        workspaceId={workspace_id}
        initialRole={role}
        initialPendingJoinRequestCount={initialPendingJoinRequestCount}
        initialJoinRequestPreview={initialJoinRequestPreview}
        initialBubbles={initialBubbles}
        initialCategoryType={initialCategoryType}
      >
        {children}
      </WorkspaceShellGate>
    </Suspense>
  );
}
