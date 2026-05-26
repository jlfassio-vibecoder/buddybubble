import type { ItemType } from '@/types/database';

export const ACTIVE_SESSION_LAUNCH_LABEL = 'Launch Active Session (Beta)' as const;
export const ACTIVE_SESSION_SAVE_AND_START_LABEL = 'Save & Start' as const;
export const ACTIVE_SESSION_SAVE_TO_START_TOOLTIP = 'Save changes to start session.' as const;
export const ACTIVE_SESSION_ADD_TITLE_TOOLTIP = 'Add a title to start session.' as const;

export type ActiveSessionLaunchUi =
  | { mode: 'hidden' }
  | { mode: 'disabled'; label: string; tooltip: string }
  | { mode: 'save_and_start'; label: typeof ACTIVE_SESSION_SAVE_AND_START_LABEL }
  | { mode: 'launch'; label: typeof ACTIVE_SESSION_LAUNCH_LABEL };

export type ResolveActiveSessionLaunchUiInput = {
  routeEnabled: boolean;
  itemType: ItemType;
  canWrite: boolean;
  taskId: string | null;
  coreDirty: boolean;
  saving: boolean;
  exerciseCount: number;
  titleTrimmed: boolean;
};

function isWorkoutItemType(itemType: ItemType): boolean {
  return itemType === 'workout' || itemType === 'workout_log';
}

export function resolveActiveSessionLaunchUi(
  input: ResolveActiveSessionLaunchUiInput,
): ActiveSessionLaunchUi {
  const {
    routeEnabled,
    itemType,
    canWrite,
    taskId,
    coreDirty,
    saving,
    exerciseCount,
    titleTrimmed,
  } = input;

  const visible = routeEnabled && isWorkoutItemType(itemType) && exerciseCount > 0;
  if (!visible) {
    return { mode: 'hidden' };
  }

  const needsSaveAndStart = !taskId || coreDirty;
  const label = needsSaveAndStart
    ? ACTIVE_SESSION_SAVE_AND_START_LABEL
    : ACTIVE_SESSION_LAUNCH_LABEL;

  if (!canWrite || saving) {
    return {
      mode: 'disabled',
      label,
      tooltip: ACTIVE_SESSION_SAVE_TO_START_TOOLTIP,
    };
  }

  if (needsSaveAndStart && !titleTrimmed) {
    return {
      mode: 'disabled',
      label,
      tooltip: ACTIVE_SESSION_ADD_TITLE_TOOLTIP,
    };
  }

  if (needsSaveAndStart) {
    return { mode: 'save_and_start', label: ACTIVE_SESSION_SAVE_AND_START_LABEL };
  }

  return { mode: 'launch', label: ACTIVE_SESSION_LAUNCH_LABEL };
}
