import { formatCountdownMmSs } from '@/lib/timer/format-countdown-mm-ss';

const DEFAULT_LIVE_SETUP_SECONDS = 10;

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

/** Compact label for outline fields: `30s` or `5:00` when at least 60 seconds. */
export function formatIntervalSecondsLabel(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec}s`;
  return formatCountdownMmSs(sec);
}

/** Authoring duration from format_params (mirrors live tabataBlockDurationSeconds formula). */
export function computeTabataBlockDurationFromParams(params: {
  work_seconds?: unknown;
  rest_seconds?: unknown;
  rounds?: unknown;
  setup_seconds?: number;
}): number | null {
  const rounds = positiveInt(params.rounds);
  const work = positiveInt(params.work_seconds);
  const rest = nonNegativeInt(params.rest_seconds);
  if (rounds == null || work == null || rest == null) return null;

  const setup = params.setup_seconds ?? DEFAULT_LIVE_SETUP_SECONDS;
  return setup + rounds * work + Math.max(0, rounds - 1) * rest;
}

export function formatTabataBlockDurationPreview(totalSeconds: number): string {
  return `~${formatCountdownMmSs(totalSeconds)} total`;
}
