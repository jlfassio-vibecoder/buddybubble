import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type AmrapTimerConfig = {
  timeCapMs: number;
  /** Optional display-only target from formatParams.target_rounds */
  targetRounds: number | null;
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/** Returns null when block is not amrap or time_cap_minutes missing/invalid. */
export function resolveAmrapTimerConfig(block: WorkoutSessionBlockView): AmrapTimerConfig | null {
  const format = block.blockFormat?.trim().toLowerCase();
  if (format !== 'amrap') return null;

  const params = block.formatParams;
  const minutes = positiveInt(params.time_cap_minutes);
  if (minutes == null) return null;

  const targetRounds = positiveInt(params.target_rounds);

  return {
    timeCapMs: minutes * 60_000,
    targetRounds: targetRounds ?? null,
  };
}
