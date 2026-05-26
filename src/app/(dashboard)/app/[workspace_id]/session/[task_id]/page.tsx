import { notFound, redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { ActiveSessionShell } from '@/features/active-session/components/ActiveSessionShell';
import { isActiveSessionRouteEnabled } from '@/lib/feature-flags/activeSessionRoute';
import { loadActiveSessionTask } from './load-session-task';

export default async function ActiveSessionPage({
  params,
}: {
  params: Promise<{ workspace_id: string; task_id: string }>;
}) {
  const { workspace_id, task_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (!isActiveSessionRouteEnabled()) {
    notFound();
  }

  const task = await loadActiveSessionTask(supabase, workspace_id, task_id);
  if (!task) {
    notFound();
  }

  return <ActiveSessionShell workspaceId={workspace_id} task={task} />;
}
