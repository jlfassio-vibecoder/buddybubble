import { formatCountdownMmSs } from '@/lib/timer/format-countdown-mm-ss';
import { resolveTabataWorkSegmentTotal } from '@/lib/workout-factory/interval-timer/tabata-circuit-rotation';

const DEFAULT_LIVE_SETUP_SECONDS = 10;

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/** Rest may be 0 (back-to-back work segments); negative is invalid. */
function nonNegativeInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  const n = Math.round(v);
  return n >= 0 ? n : null;
}

/** Compact label for outline fields: `30s` or `5:00` when at least 60 seconds. */
export function formatIntervalSecondsLabel(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec}s`;
  return formatCountdownMmSs(sec);
}

/** Authoring duration from format_params (mirrors live tabataBlockDurationSeconds formula). */
export function computeTabataBlockDurationFromParams(
  params: {
    work_seconds?: unknown;
    rest_seconds?: unknown;
    rounds?: unknown;
    round_rest_seconds?: unknown;
    setup_seconds?: number;
  },
  options?: { exerciseCount?: number },
): number | null {
  const circuitRounds = positiveInt(params.rounds);
  const work = positiveInt(params.work_seconds);
  const rest = nonNegativeInt(params.rest_seconds);
  if (circuitRounds == null || work == null || rest == null) return null;

  const exerciseCount = options?.exerciseCount ?? 0;
  const workSegments = resolveTabataWorkSegmentTotal(circuitRounds, exerciseCount);
  const roundRest = nonNegativeInt(params.round_rest_seconds) ?? 0;
  const setup = params.setup_seconds ?? DEFAULT_LIVE_SETUP_SECONDS;

  if (exerciseCount > 1) {
    const stationRestCount = circuitRounds * (exerciseCount - 1);
    const roundRestCount = Math.max(0, circuitRounds - 1);
    const endOfPassRest = roundRest > 0 ? roundRest : rest;
    return setup + workSegments * work + stationRestCount * rest + roundRestCount * endOfPassRest;
  }

  // Single-station / empty: ignore round_rest_seconds.
  return setup + workSegments * work + Math.max(0, workSegments - 1) * rest;
}

export function formatTabataBlockDurationPreview(totalSeconds: number): string {
  return `~${formatCountdownMmSs(totalSeconds)} total`;
}
