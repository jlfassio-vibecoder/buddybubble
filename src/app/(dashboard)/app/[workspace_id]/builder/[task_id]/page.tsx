import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import { WorkoutBuilderShell } from '@/features/workout-builder/WorkoutBuilderShell';
import { isWorkoutBuilderRouteEnabled } from '@/lib/feature-flags/workoutBuilderRoute';
import { loadBuilderTask } from './load-builder-task';

export default async function WorkoutBuilderPage({
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

  if (!isWorkoutBuilderRouteEnabled()) {
    notFound();
  }

  const task = await loadBuilderTask(supabase, workspace_id, task_id);
  if (!task) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Loading builder…
        </div>
      }
    >
      <WorkoutBuilderShell workspaceId={workspace_id} task={task} />
    </Suspense>
  );
}
