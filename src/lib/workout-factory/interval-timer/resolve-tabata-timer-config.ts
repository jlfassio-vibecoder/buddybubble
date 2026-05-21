import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type TabataTimerConfig = {
  prepareMs: number;
  workMs: number;
  restMs: number;
  totalRounds: number;
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function secondsToMs(v: unknown, defaultSec: number): number {
  const n = positiveInt(v);
  return (n ?? defaultSec) * 1000;
}

/** Returns null when block is not tabata or rounds missing/invalid. */
export function resolveTabataTimerConfig(block: WorkoutSessionBlockView): TabataTimerConfig | null {
  const format = block.blockFormat?.trim().toLowerCase();
  if (format !== 'tabata') return null;

  const params = block.formatParams;
  const totalRounds = positiveInt(params.rounds);
  if (totalRounds == null) return null;

  return {
    prepareMs: 0,
    workMs: secondsToMs(params.work_seconds, 20),
    restMs: secondsToMs(params.rest_seconds, 10),
    totalRounds,
  };
}
