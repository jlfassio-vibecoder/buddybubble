import type { TabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { TabataFormatParams } from '@/lib/workout-factory/types/tabata-format-params';
import {
  resolveTabataActiveRestExerciseName,
  resolveTabataNextWorkExerciseName,
  resolveTabataWorkExerciseName,
  type TabataExerciseNameSource,
} from '@/lib/workout-factory/interval-timer/tabata-circuit-rotation';

/** Passive / zero-rest work: hide billboard after this many seconds into the segment. */
export const TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC = 3;

/** Active-rest work and rest: hide billboard after this many seconds into the segment. */
export const TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC = 5;

const BILLBOARD_NAME_FALLBACK = 'Movement';

export type TabataBillboardModel = {
  visible: boolean;
  prefix: 'next' | null;
  name: string;
  fadeAfterSec: number | null;
};

export type ResolveTabataBillboardModelArgs = {
  mechanics: TabataMechanicsState | null;
  formatParams?: TabataFormatParams;
  exercises: readonly TabataExerciseNameSource[];
  /**
   * Seconds elapsed in the current segment. Callers pass a frozen value while paused
   * (e.g. `totalSec - remainingSec`); this function never reads wall-clock time.
   */
  elapsedSec: number;
};

function isActiveRestFormat(formatParams?: TabataFormatParams): boolean {
  return (
    formatParams?.rest_mode === 'active' &&
    Array.isArray(formatParams.active_rest_exercises) &&
    formatParams.active_rest_exercises.length > 0
  );
}

function displayName(resolved: string | null): string {
  return resolved?.trim() || BILLBOARD_NAME_FALLBACK;
}

function withFadeVisibility(
  model: Omit<TabataBillboardModel, 'visible'>,
  elapsedSec: number,
): TabataBillboardModel {
  const visible = model.fadeAfterSec == null ? true : elapsedSec < model.fadeAfterSec;
  return { ...model, visible };
}

/**
 * Pure billboard copy + visibility model for the top-center Interval Billboard.
 * Does not mount UI; Phase 2 maps this to opacity / chrome.
 */
export function resolveTabataBillboardModel(
  args: ResolveTabataBillboardModelArgs,
): TabataBillboardModel | null {
  const { mechanics, formatParams, exercises, elapsedSec } = args;
  if (mechanics == null) return null;

  const { segment } = mechanics;
  if (segment === 'idle' || segment === 'done') return null;

  if (segment === 'setup') {
    return withFadeVisibility(
      {
        prefix: null,
        name: displayName(resolveTabataWorkExerciseName(1, exercises)),
        fadeAfterSec: null,
      },
      elapsedSec,
    );
  }

  if (segment === 'work') {
    const name = displayName(resolveTabataWorkExerciseName(mechanics.round_index, exercises));
    if (isActiveRestFormat(formatParams)) {
      return withFadeVisibility(
        {
          prefix: null,
          name,
          fadeAfterSec: TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
        },
        elapsedSec,
      );
    }
    return withFadeVisibility(
      {
        prefix: null,
        name,
        fadeAfterSec: TABATA_BILLBOARD_PASSIVE_WORK_FADE_SEC,
      },
      elapsedSec,
    );
  }

  if (segment === 'rest') {
    if (isActiveRestFormat(formatParams)) {
      const names = formatParams?.active_rest_exercises ?? [];
      const name = displayName(resolveTabataActiveRestExerciseName(mechanics.round_index, names));
      return withFadeVisibility(
        {
          prefix: null,
          name,
          fadeAfterSec: TABATA_BILLBOARD_ACTIVE_SEGMENT_FADE_SEC,
        },
        elapsedSec,
      );
    }

    const nextName = resolveTabataNextWorkExerciseName(
      mechanics.round_index,
      mechanics.total_rounds,
      exercises,
    );
    if (nextName == null) return null;
    return withFadeVisibility(
      {
        prefix: 'next',
        name: displayName(nextName),
        fadeAfterSec: null,
      },
      elapsedSec,
    );
  }

  return null;
}
