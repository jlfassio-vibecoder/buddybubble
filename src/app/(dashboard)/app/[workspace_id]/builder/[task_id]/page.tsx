import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { WorkoutBuilderShell } from '@/features/workout-builder/WorkoutBuilderShell';
import { WorkoutBuilderUnavailable } from '@/features/workout-builder/WorkoutBuilderUnavailable';
import { isWorkoutBuilderRouteEnabled } from '@/lib/feature-flags/workoutBuilderRoute';
import { loadBuilderTask } from './load-builder-task';

export default async function WorkoutBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_id: string; task_id: string }>;
  searchParams: Promise<{ return?: string; from?: string }>;
}) {
  const { workspace_id, task_id } = await params;
  const sp = await searchParams;
  const returnPath = typeof sp.return === 'string' ? sp.return : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (!isWorkoutBuilderRouteEnabled()) {
    console.warn('[workout-builder] route disabled', {
      workspaceId: workspace_id,
      taskId: task_id,
      reason: 'disabled',
    });
    return (
      <WorkoutBuilderUnavailable
        workspaceId={workspace_id}
        taskId={task_id}
        reason="disabled"
        returnPath={returnPath}
      />
    );
  }

  const loaded = await loadBuilderTask(supabase, workspace_id, task_id);
  if (!loaded.ok) {
    if (loaded.reason === 'unauthenticated') {
      redirect('/login');
    }
    console.warn('[workout-builder] load failed', {
      workspaceId: workspace_id,
      taskId: task_id,
      reason: loaded.reason,
    });
    return (
      <WorkoutBuilderUnavailable
        workspaceId={workspace_id}
        taskId={task_id}
        reason={loaded.reason}
        returnPath={returnPath}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Loading builder…
        </div>
      }
    >
      <WorkoutBuilderShell workspaceId={workspace_id} task={loaded.task} />
    </Suspense>
  );
}
