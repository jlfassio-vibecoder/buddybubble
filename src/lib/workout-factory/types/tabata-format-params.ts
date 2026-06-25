import type { IntervalPresetId } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';

export type { IntervalPresetId };

/** Closed-world Tabata formatParams (superset of legacy keys). */
export type TabataFormatParams = {
  work_seconds?: number;
  rest_seconds?: number;
  rounds?: number;
  interval_preset?: IntervalPresetId;
};
