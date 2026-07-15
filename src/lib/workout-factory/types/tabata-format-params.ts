import type { IntervalPresetId } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';

export type { IntervalPresetId };

/** Rest phase presentation: omit / passive = idle Rest HUD; active = cued low-intensity move. */
export type TabataRestMode = 'passive' | 'active';

/** Closed-world Tabata formatParams (superset of legacy keys). */
export type TabataFormatParams = {
  work_seconds?: number;
  rest_seconds?: number;
  rounds?: number;
  interval_preset?: IntervalPresetId;
  /** When `'active'`, rest phase shows `active_rest_exercises` (requires rest_seconds > 0). */
  rest_mode?: TabataRestMode;
  /** Names shown during active rest; omit unless rest_mode === 'active'. */
  active_rest_exercises?: string[];
};
