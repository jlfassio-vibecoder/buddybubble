export type EmomSegment = 'idle' | 'setup' | 'minute' | 'done';

/** Mandatory pre-minute countdown before minute 1. */
export const EMOM_DEFAULT_SETUP_SECONDS = 10;

export type EmomMechanicsState = {
  segment: EmomSegment;
  /** 0 during setup; 1..total_minutes during active minutes */
  minute_index: number;
  total_minutes: number;
  interval_seconds: number;
  setup_seconds: number;
  segment_started_at: string | null;
  is_alternating?: boolean;
  alternating_stations?: number[][];
  is_paused?: boolean;
  elapsed_in_segment?: number;
};

export type EmomTimerConfig = {
  totalMinutes: number;
  intervalSeconds: number;
  setupSeconds?: number;
  isAlternating?: boolean;
  alternatingStations?: number[][];
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function parseAlternatingStations(raw: unknown): number[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[][] = [];
  for (const minute of raw) {
    if (!Array.isArray(minute)) return undefined;
    const stations: number[] = [];
    for (const idx of minute) {
      if (typeof idx !== 'number' || !Number.isFinite(idx)) return undefined;
      stations.push(Math.round(idx));
    }
    out.push(stations);
  }
  return out.length > 0 ? out : undefined;
}

export function parseEmomMechanicsState(raw: unknown): EmomMechanicsState | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const segment = o.segment;
  if (segment !== 'idle' && segment !== 'setup' && segment !== 'minute' && segment !== 'done') {
    return null;
  }
  const totalMinutes = positiveInt(o.total_minutes);
  const intervalSeconds = positiveInt(o.interval_seconds);
  const minuteIndex =
    typeof o.minute_index === 'number' && Number.isFinite(o.minute_index)
      ? Math.max(0, Math.round(o.minute_index))
      : null;
  const setupSeconds = positiveInt(o.setup_seconds) ?? EMOM_DEFAULT_SETUP_SECONDS;
  if (totalMinutes == null || intervalSeconds == null || minuteIndex == null) {
    return null;
  }
  const segmentStartedAt =
    o.segment_started_at == null
      ? null
      : typeof o.segment_started_at === 'string'
        ? o.segment_started_at
        : null;
  const isPaused = o.is_paused === true;
  let elapsedInSegment: number | undefined;
  if (typeof o.elapsed_in_segment === 'number' && Number.isFinite(o.elapsed_in_segment)) {
    elapsedInSegment = Math.max(0, o.elapsed_in_segment);
  }
  const isAlternating = o.is_alternating === true;
  const alternatingStations = parseAlternatingStations(o.alternating_stations);
  return {
    segment,
    minute_index: minuteIndex,
    total_minutes: totalMinutes,
    interval_seconds: intervalSeconds,
    setup_seconds: setupSeconds,
    segment_started_at: segmentStartedAt,
    ...(isAlternating ? { is_alternating: true } : {}),
    ...(alternatingStations != null ? { alternating_stations: alternatingStations } : {}),
    ...(isPaused ? { is_paused: true } : {}),
    ...(elapsedInSegment != null ? { elapsed_in_segment: elapsedInSegment } : {}),
  };
}

export function isEmomSegmentRunnable(state: EmomMechanicsState): boolean {
  return state.segment === 'setup' || state.segment === 'minute';
}

export function isEmomHostAutoAdvanceSegment(state: EmomMechanicsState): boolean {
  if (!isEmomSegmentRunnable(state) || state.segment === 'done') return false;
  return state.segment_started_at != null;
}

export function isEmomTimerFrozen(state: EmomMechanicsState): boolean {
  return (
    state.is_paused === true && isEmomSegmentRunnable(state) && state.segment_started_at != null
  );
}

function segmentElapsedSec(state: EmomMechanicsState, nowMs: number): number {
  if (!state.segment_started_at) return 0;
  const startedMs = new Date(state.segment_started_at).getTime();
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, (nowMs - startedMs) / 1000);
}

export function buildInitialEmomMechanicsState(config: EmomTimerConfig): EmomMechanicsState {
  return {
    segment: 'setup',
    minute_index: 0,
    total_minutes: config.totalMinutes,
    interval_seconds: config.intervalSeconds,
    setup_seconds: config.setupSeconds ?? EMOM_DEFAULT_SETUP_SECONDS,
    segment_started_at: null,
    ...(config.isAlternating ? { is_alternating: true } : {}),
    ...(config.alternatingStations != null
      ? { alternating_stations: config.alternatingStations.map((m) => [...m]) }
      : {}),
  };
}

export function emomBlockDurationSeconds(state: EmomMechanicsState): number {
  return state.setup_seconds + state.total_minutes * state.interval_seconds;
}

function segmentDurationSec(state: EmomMechanicsState): number {
  if (state.segment === 'setup') return state.setup_seconds;
  if (state.segment === 'minute') return state.interval_seconds;
  if (state.segment === 'idle') return state.setup_seconds;
  return 0;
}

export function deriveEmomSegmentRemainingSec(state: EmomMechanicsState, nowMs: number): number {
  if (state.segment === 'done') return 0;
  if (state.segment === 'idle') return state.setup_seconds;
  if (state.segment === 'setup' && !state.segment_started_at) return state.setup_seconds;

  const durationSec = segmentDurationSec(state);

  if (isEmomTimerFrozen(state)) {
    const elapsed =
      state.elapsed_in_segment != null ? state.elapsed_in_segment : segmentElapsedSec(state, nowMs);
    return Math.max(0, Math.ceil(durationSec - elapsed));
  }

  if (!state.segment_started_at) return durationSec;

  const elapsedSec = segmentElapsedSec(state, nowMs);
  return Math.max(0, Math.ceil(durationSec - elapsedSec));
}

export function isEmomSegmentElapsed(state: EmomMechanicsState, nowMs: number): boolean {
  if (!isEmomHostAutoAdvanceSegment(state)) return false;
  if (isEmomTimerFrozen(state)) return false;
  return deriveEmomSegmentRemainingSec(state, nowMs) <= 0;
}

export function beginEmomSegmentTimer(
  state: EmomMechanicsState,
  nowMs: number,
): EmomMechanicsState {
  if (state.segment === 'setup' && state.segment_started_at == null) {
    return withSegmentAnchor(state, 'setup', 0, nowMs);
  }
  if (state.segment === 'idle') {
    return withSegmentAnchor(
      {
        ...state,
        segment: 'setup',
        setup_seconds: state.setup_seconds ?? EMOM_DEFAULT_SETUP_SECONDS,
      },
      'setup',
      0,
      nowMs,
    );
  }
  return state;
}

export function freezeEmomMechanicsStateForPause(
  state: EmomMechanicsState,
  nowMs: number,
): EmomMechanicsState {
  if (!isEmomHostAutoAdvanceSegment(state) || isEmomTimerFrozen(state)) {
    return state;
  }
  const elapsed = segmentElapsedSec(state, nowMs);
  return {
    ...state,
    is_paused: true,
    elapsed_in_segment: elapsed,
  };
}

export function unfreezeEmomMechanicsStateForResume(
  state: EmomMechanicsState,
  nowMs: number,
): EmomMechanicsState {
  if (!isEmomTimerFrozen(state) || state.elapsed_in_segment == null) {
    const { is_paused: _p, elapsed_in_segment: _e, ...rest } = state;
    return rest;
  }
  const anchorMs = nowMs - state.elapsed_in_segment * 1000;
  const { is_paused: _p, elapsed_in_segment: _e, ...rest } = state;
  return {
    ...rest,
    segment_started_at: new Date(anchorMs).toISOString(),
  };
}

function stripPauseFields(state: EmomMechanicsState): EmomMechanicsState {
  const { is_paused: _p, elapsed_in_segment: _e, ...rest } = state;
  return rest;
}

function withSegmentAnchor(
  state: EmomMechanicsState,
  segment: EmomSegment,
  minuteIndex: number,
  anchorMs: number,
): EmomMechanicsState {
  return {
    ...stripPauseFields(state),
    segment,
    minute_index: minuteIndex,
    segment_started_at: new Date(anchorMs).toISOString(),
  };
}

export function computeNextEmomMechanicsState(
  state: EmomMechanicsState,
  nowMs: number,
): EmomMechanicsState {
  const anchorMs =
    state.segment_started_at != null
      ? new Date(state.segment_started_at).getTime() + segmentDurationSec(state) * 1000
      : nowMs;

  if (state.segment === 'setup') {
    return withSegmentAnchor(state, 'minute', 1, anchorMs);
  }

  if (state.segment === 'idle') {
    return withSegmentAnchor(
      {
        ...state,
        segment: 'setup',
        setup_seconds: state.setup_seconds ?? EMOM_DEFAULT_SETUP_SECONDS,
      },
      'setup',
      0,
      nowMs,
    );
  }

  if (state.segment === 'minute') {
    const isLastMinute = state.minute_index >= state.total_minutes;
    if (isLastMinute) {
      return { ...stripPauseFields(state), segment: 'done', segment_started_at: null };
    }
    return withSegmentAnchor(state, 'minute', state.minute_index + 1, anchorMs);
  }

  return state;
}

export function emomSegmentLabel(segment: EmomSegment, opts?: { isPaused?: boolean }): string {
  if (opts?.isPaused && (segment === 'setup' || segment === 'minute')) {
    return 'Paused';
  }
  switch (segment) {
    case 'setup':
      return 'Get Ready';
    case 'minute':
      return 'Work';
    case 'done':
      return 'Complete';
    default:
      return 'Ready';
  }
}

export function emomMinuteDisplayLabel(state: EmomMechanicsState): string | null {
  if (state.segment !== 'minute' || state.minute_index < 1) return null;
  if (state.interval_seconds === 60) {
    return `Minute ${state.minute_index} of ${state.total_minutes}`;
  }
  return `Round ${state.minute_index} of ${state.total_minutes}`;
}

export function emomMechanicsStateToJson(state: EmomMechanicsState): Record<string, unknown> {
  const base: Record<string, unknown> = {
    segment: state.segment,
    minute_index: state.minute_index,
    total_minutes: state.total_minutes,
    interval_seconds: state.interval_seconds,
    setup_seconds: state.setup_seconds,
    segment_started_at: state.segment_started_at,
  };
  if (state.is_alternating === true) {
    base.is_alternating = true;
    if (state.alternating_stations != null) {
      base.alternating_stations = state.alternating_stations;
    }
  }
  if (state.is_paused === true) {
    base.is_paused = true;
    if (state.elapsed_in_segment != null) {
      base.elapsed_in_segment = state.elapsed_in_segment;
    }
  }
  return base;
}
