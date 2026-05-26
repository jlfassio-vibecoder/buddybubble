'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildActiveSessionUrl } from '@/lib/active-session/build-active-session-url';
import { isActiveSessionRouteEnabled } from '@/lib/feature-flags/activeSessionRoute';
import {
  resolveActiveSessionLaunchUi,
  type ActiveSessionLaunchUi,
} from '@/lib/active-session/resolve-active-session-launch-ui';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { ItemType, Json } from '@/types/database';

export type UseActiveSessionLaunchFromTaskModalArgs = {
  workspaceId: string;
  taskId: string | null;
  itemType: ItemType;
  canWrite: boolean;
  coreDirty: boolean;
  saving: boolean;
  metadata: Json;
  title: string;
  createTask: () => Promise<string | null>;
  saveCoreFields: () => Promise<boolean>;
  onComplete?: () => void;
};

export type ActiveSessionLaunchFromTaskModal = {
  launchUi: ActiveSessionLaunchUi;
  handleLaunchClick: () => void;
  isLaunching: boolean;
};

export function useActiveSessionLaunchFromTaskModal({
  workspaceId,
  taskId,
  itemType,
  canWrite,
  coreDirty,
  saving,
  metadata,
  title,
  createTask,
  saveCoreFields,
  onComplete,
}: UseActiveSessionLaunchFromTaskModalArgs): ActiveSessionLaunchFromTaskModal {
  const router = useRouter();
  const [isLaunching, setIsLaunching] = useState(false);

  const exerciseCount = useMemo(
    () => buildWorkoutSessionViewModel(metadata ?? {}).flatExercises.length,
    [metadata],
  );

  const launchUi = useMemo(
    () =>
      resolveActiveSessionLaunchUi({
        routeEnabled: isActiveSessionRouteEnabled(),
        itemType,
        canWrite,
        taskId,
        coreDirty,
        saving: saving || isLaunching,
        exerciseCount,
        titleTrimmed: title.trim().length > 0,
      }),
    [itemType, canWrite, taskId, coreDirty, saving, isLaunching, exerciseCount, title],
  );

  const handleLaunchClick = useCallback(() => {
    if (launchUi.mode === 'hidden' || launchUi.mode === 'disabled') return;

    void (async () => {
      setIsLaunching(true);
      try {
        let navigateTaskId = taskId;

        if (launchUi.mode === 'save_and_start') {
          if (!taskId) {
            const createdId = await createTask();
            if (!createdId) return;
            navigateTaskId = createdId;
          } else {
            const ok = await saveCoreFields();
            if (!ok) return;
            navigateTaskId = taskId;
          }
        } else if (!navigateTaskId) {
          return;
        }

        router.push(buildActiveSessionUrl(workspaceId, navigateTaskId, { from: 'modal' }));
        onComplete?.();
      } finally {
        setIsLaunching(false);
      }
    })();
  }, [launchUi, taskId, createTask, saveCoreFields, router, workspaceId, onComplete]);

  return { launchUi, handleLaunchClick, isLaunching };
}
