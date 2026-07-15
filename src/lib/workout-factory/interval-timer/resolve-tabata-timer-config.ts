import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { resolveTabataWorkSegmentTotal } from '@/lib/workout-factory/interval-timer/tabata-circuit-rotation';

export type TabataTimerConfig = {
  prepareMs: number;
  workMs: number;
  restMs: number;
  /** Longer rest after a full circuit pass; 0 = disabled. */
  roundRestMs: number;
  /** Total work segments for the timer FSM. */
  totalRounds: number;
  /** format_params.rounds — circuit passes through the exercise list. */
  circuitRounds: number;
  /** block.exercises.length (0 allowed). */
  exerciseCount: number;
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function nonNegativeInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 ? n : null;
}

function secondsToMs(v: unknown, defaultSec: number): number {
  const n = positiveInt(v);
  return (n ?? defaultSec) * 1000;
}

/** Rest allows 0 (Path A); omitted/invalid falls back to defaultSec. */
function restSecondsToMs(v: unknown, defaultSec: number): number {
  const n = nonNegativeInt(v);
  return (n ?? defaultSec) * 1000;
}

/** Returns null when block is not tabata or rounds missing/invalid. */
export function resolveTabataTimerConfig(block: WorkoutSessionBlockView): TabataTimerConfig | null {
  const format = block.blockFormat?.trim().toLowerCase();
  if (format !== 'tabata') return null;

  const params = block.formatParams;
  const circuitRounds = positiveInt(params.rounds);
  if (circuitRounds == null) return null;

  const exerciseCount = block.exercises.length;
  const totalRounds = resolveTabataWorkSegmentTotal(circuitRounds, exerciseCount);

  const roundRestSec = nonNegativeInt(params.round_rest_seconds) ?? 0;

  return {
    prepareMs: 0,
    workMs: secondsToMs(params.work_seconds, 20),
    restMs: restSecondsToMs(params.rest_seconds, 10),
    roundRestMs: roundRestSec * 1000,
    totalRounds,
    circuitRounds,
    exerciseCount,
  };
}
