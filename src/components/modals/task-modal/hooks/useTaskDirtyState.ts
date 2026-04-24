'use client';

import type { MutableRefObject } from 'react';
import { useMemo } from 'react';
import type { ItemType } from '@/types/database';
import type { TaskPriority } from '@/lib/task-priority';
import type { TaskVisibility } from '@/types/database';
import {
  parseScheduledDateFromInput,
  parseTimeHmFromScheduledInputs,
  type TaskModalOriginalSnapshot,
} from '@/components/modals/task-modal/task-modal-save-utils';

export type UseTaskDirtyStateArgs = {
  originalRef: MutableRefObject<TaskModalOriginalSnapshot | null>;
  isCreateMode: boolean;
  title: string;
  description: string;
  status: string;
  priority: TaskPriority;
  scheduledOn: string;
  scheduledTime: string;
  itemType: ItemType;
  metadataForSave: unknown;
  visibility: TaskVisibility;
  assignedTo: string | null;
  liveStreamEnabled?: boolean;
};

export function useTaskDirtyState({
  originalRef,
  isCreateMode,
  title,
  description,
  status,
  priority,
  scheduledOn,
  scheduledTime,
  itemType,
  metadataForSave,
  visibility,
  assignedTo,
  liveStreamEnabled = false,
}: UseTaskDirtyStateArgs): { coreDirty: boolean } {
  const coreDirty = useMemo(() => {
    const o = originalRef.current;
    const sched = parseScheduledDateFromInput(scheduledOn);
    const timeHm = parseTimeHmFromScheduledInputs(sched, scheduledTime);
    const metaJson = JSON.stringify(metadataForSave);
    const origLive = o?.liveStreamEnabled ?? false;
    if (!o) {
      return (
        isCreateMode &&
        (title.trim().length > 0 ||
          itemType !== 'task' ||
          metaJson !== '{}' ||
          visibility !== 'private' ||
          assignedTo != null ||
          liveStreamEnabled)
      );
    }
    return (
      title.trim() !== o.title ||
      (description ?? '').trim() !== (o.description ?? '').trim() ||
      status !== o.status ||
      priority !== o.priority ||
      sched !== (o.scheduledOn ?? null) ||
      (timeHm ?? null) !== (o.scheduledTime ?? null) ||
      itemType !== o.itemType ||
      metaJson !== o.metadataJson ||
      visibility !== o.visibility ||
      (assignedTo ?? null) !== (o.assignedTo ?? null) ||
      liveStreamEnabled !== origLive
    );
  }, [
    title,
    description,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    isCreateMode,
    itemType,
    metadataForSave,
    visibility,
    assignedTo,
    liveStreamEnabled,
  ]);

  return { coreDirty };
}
