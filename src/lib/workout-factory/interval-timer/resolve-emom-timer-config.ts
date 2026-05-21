import { resolveEmomTotalRounds } from '@/lib/workout-factory/interval-timer/resolve-emom-total-rounds';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type EmomTimerConfig = {
  intervalMs: number;
  totalRounds: number;
  /** For display: Minute vs Round label */
  intervalSeconds: number;
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/** Returns null when block is not emom or required params missing/invalid. */
export function resolveEmomTimerConfig(block: WorkoutSessionBlockView): EmomTimerConfig | null {
  const format = block.blockFormat?.trim().toLowerCase();
  if (format !== 'emom') return null;

  const params = block.formatParams;
  const intervalSeconds = positiveInt(params.interval_seconds);
  if (intervalSeconds == null) return null;

  const totalRounds = resolveEmomTotalRounds(params);
  if (totalRounds == null || totalRounds <= 0) return null;

  return {
    intervalMs: intervalSeconds * 1000,
    totalRounds,
    intervalSeconds,
  };
}
