'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OpenTaskOptions } from '@/types/open-task-options';
import {
  WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY,
  WORKOUT_BUILDER_TASK_HANDOFF_QUERY,
} from '@/lib/workout-builder/build-workout-builder-url';

type UseBuilderGeneratedTaskHandoffArgs = {
  openTaskModal: (id: string, opts?: OpenTaskOptions) => void;
};

/**
 * Consumes `?open_task=<taskId>&open_workout_viewer=1` after builder save, opens TaskModal
 * with the workout viewer split, then strips handoff params from the URL.
 */
export function useBuilderGeneratedTaskHandoff({
  openTaskModal,
}: UseBuilderGeneratedTaskHandoffArgs) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const taskId = searchParams.get(WORKOUT_BUILDER_TASK_HANDOFF_QUERY)?.trim();
    if (!taskId) return;

    const openViewer = searchParams.get(WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY) === '1';
    const fp = `${taskId}:${openViewer}:${searchParams.toString()}`;
    if (handledRef.current === fp) return;
    handledRef.current = fp;

    openTaskModal(taskId, {
      tab: 'details',
      viewMode: 'full',
      openWorkoutViewer: openViewer,
    });

    const next = new URLSearchParams(searchParams.toString());
    next.delete(WORKOUT_BUILDER_TASK_HANDOFF_QUERY);
    next.delete(WORKOUT_BUILDER_OPEN_WORKOUT_VIEWER_QUERY);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, openTaskModal]);
}
