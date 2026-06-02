export type TabataSegment = 'idle' | 'setup' | 'work' | 'rest' | 'done';

/** Mandatory pre-round countdown before round 1 work. */
export const TABATA_DEFAULT_SETUP_SECONDS = 10;

export type TabataMechanicsState = {
  segment: TabataSegment;
  round_index: number;
  total_rounds: number;
  work_seconds: number;
  rest_seconds: number;
  setup_seconds: number;
  segment_started_at: string | null;
  /** When true, countdown is frozen using `elapsed_in_segment`. */
  is_paused?: boolean;
  /** Seconds elapsed in the current segment at pause time. */
  elapsed_in_segment?: number;
};

export type TabataTimerConfig = {
  totalRounds: number;
  workSeconds: number;
  restSeconds: number;
  setupSeconds?: number;
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

export function parseTabataMechanicsState(raw: unknown): TabataMechanicsState | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const segment = o.segment;
  if (
    segment !== 'idle' &&
    segment !== 'setup' &&
    segment !== 'work' &&
    segment !== 'rest' &&
    segment !== 'done'
  ) {
    return null;
  }
  const totalRounds = positiveInt(o.total_rounds);
  const workSeconds = positiveInt(o.work_seconds);
  const restSeconds =
    typeof o.rest_seconds === 'number' && Number.isFinite(o.rest_seconds)
      ? Math.max(0, Math.round(o.rest_seconds))
      : null;
  const roundIndex =
    typeof o.round_index === 'number' && Number.isFinite(o.round_index)
      ? Math.max(0, Math.round(o.round_index))
      : null;
  const setupSeconds = positiveInt(o.setup_seconds) ?? TABATA_DEFAULT_SETUP_SECONDS;
  if (totalRounds == null || workSeconds == null || restSeconds == null || roundIndex == null) {
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
  return {
    segment,
    round_index: roundIndex,
    total_rounds: totalRounds,
    work_seconds: workSeconds,
    rest_seconds: restSeconds,
    setup_seconds: setupSeconds,
    segment_started_at: segmentStartedAt,
    ...(isPaused ? { is_paused: true } : {}),
    ...(elapsedInSegment != null ? { elapsed_in_segment: elapsedInSegment } : {}),
  };
}

export function isTabataSegmentRunnable(state: TabataMechanicsState): boolean {
  return state.segment === 'setup' || state.segment === 'work' || state.segment === 'rest';
}

export function isTabataHostAutoAdvanceSegment(state: TabataMechanicsState): boolean {
  if (!isTabataSegmentRunnable(state) || state.segment === 'done') return false;
  return state.segment_started_at != null;
}

export function isTabataTimerFrozen(state: TabataMechanicsState): boolean {
  return (
    state.is_paused === true && isTabataSegmentRunnable(state) && state.segment_started_at != null
  );
}

function segmentElapsedSec(state: TabataMechanicsState, nowMs: number): number {
  if (!state.segment_started_at) return 0;
  const startedMs = new Date(state.segment_started_at).getTime();
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, (nowMs - startedMs) / 1000);
}

export function buildInitialTabataMechanicsState(config: TabataTimerConfig): TabataMechanicsState {
  return {
    segment: 'setup',
    round_index: 0,
    total_rounds: config.totalRounds,
    work_seconds: config.workSeconds,
    rest_seconds: config.restSeconds,
    setup_seconds: config.setupSeconds ?? TABATA_DEFAULT_SETUP_SECONDS,
    segment_started_at: null,
  };
}

export function tabataBlockDurationSeconds(state: TabataMechanicsState): number {
  const { total_rounds, work_seconds, rest_seconds, setup_seconds } = state;
  return setup_seconds + total_rounds * work_seconds + Math.max(0, total_rounds - 1) * rest_seconds;
}

function segmentDurationSec(state: TabataMechanicsState): number {
  if (state.segment === 'setup') return state.setup_seconds;
  if (state.segment === 'work') return state.work_seconds;
  if (state.segment === 'rest') return state.rest_seconds;
  if (state.segment === 'idle') return state.setup_seconds;
  return 0;
}

export function deriveTabataSegmentRemainingSec(
  state: TabataMechanicsState,
  nowMs: number,
): number {
  if (state.segment === 'done') return 0;
  if (state.segment === 'idle') return state.setup_seconds;
  if (state.segment === 'setup' && !state.segment_started_at) return state.setup_seconds;

  const durationSec = segmentDurationSec(state);

  if (isTabataTimerFrozen(state)) {
    const elapsed =
      state.elapsed_in_segment != null ? state.elapsed_in_segment : segmentElapsedSec(state, nowMs);
    return Math.max(0, Math.ceil(durationSec - elapsed));
  }

  if (!state.segment_started_at) return durationSec;

  const elapsedSec = segmentElapsedSec(state, nowMs);
  return Math.max(0, Math.ceil(durationSec - elapsedSec));
}

export function isTabataSegmentElapsed(state: TabataMechanicsState, nowMs: number): boolean {
  if (!isTabataHostAutoAdvanceSegment(state)) return false;
  if (isTabataTimerFrozen(state)) return false;
  return deriveTabataSegmentRemainingSec(state, nowMs) <= 0;
}

/** Host Start: begin setup countdown (or legacy idle → setup). */
export function beginTabataSegmentTimer(
  state: TabataMechanicsState,
  nowMs: number,
): TabataMechanicsState {
  if (state.segment === 'setup' && state.segment_started_at == null) {
    return withSegmentAnchor(state, 'setup', 0, nowMs);
  }
  if (state.segment === 'idle') {
    return withSegmentAnchor(
      {
        ...state,
        segment: 'setup',
        setup_seconds: state.setup_seconds ?? TABATA_DEFAULT_SETUP_SECONDS,
      },
      'setup',
      0,
      nowMs,
    );
  }
  return state;
}

/** Host pause: freeze elapsed time in the current segment. */
export function freezeTabataMechanicsStateForPause(
  state: TabataMechanicsState,
  nowMs: number,
): TabataMechanicsState {
  if (!isTabataHostAutoAdvanceSegment(state) || isTabataTimerFrozen(state)) {
    return state;
  }
  const elapsed = segmentElapsedSec(state, nowMs);
  return {
    ...state,
    is_paused: true,
    elapsed_in_segment: elapsed,
  };
}

/** Host resume: rewind `segment_started_at` so the countdown continues from the frozen elapsed time. */
export function unfreezeTabataMechanicsStateForResume(
  state: TabataMechanicsState,
  nowMs: number,
): TabataMechanicsState {
  if (!isTabataTimerFrozen(state) || state.elapsed_in_segment == null) {
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

function stripPauseFields(state: TabataMechanicsState): TabataMechanicsState {
  const { is_paused: _p, elapsed_in_segment: _e, ...rest } = state;
  return rest;
}

function withSegmentAnchor(
  state: TabataMechanicsState,
  segment: TabataSegment,
  roundIndex: number,
  anchorMs: number,
): TabataMechanicsState {
  return {
    ...stripPauseFields(state),
    segment,
    round_index: roundIndex,
    segment_started_at: new Date(anchorMs).toISOString(),
  };
}

/** Compute the next durable mechanics_state after the current segment elapses. */
export function computeNextTabataMechanicsState(
  state: TabataMechanicsState,
  nowMs: number,
): TabataMechanicsState {
  const anchorMs =
    state.segment_started_at != null
      ? new Date(state.segment_started_at).getTime() + segmentDurationSec(state) * 1000
      : nowMs;

  if (state.segment === 'setup') {
    return withSegmentAnchor(state, 'work', 1, anchorMs);
  }

  if (state.segment === 'idle') {
    return withSegmentAnchor(
      {
        ...state,
        segment: 'setup',
        setup_seconds: state.setup_seconds ?? TABATA_DEFAULT_SETUP_SECONDS,
      },
      'setup',
      0,
      nowMs,
    );
  }

  if (state.segment === 'work') {
    const isLastRound = state.round_index >= state.total_rounds;
    if (isLastRound) {
      return { ...stripPauseFields(state), segment: 'done', segment_started_at: null };
    }
    if (state.rest_seconds > 0) {
      return withSegmentAnchor(state, 'rest', state.round_index, anchorMs);
    }
    return withSegmentAnchor(state, 'work', state.round_index + 1, anchorMs);
  }

  if (state.segment === 'rest') {
    const isLastRound = state.round_index >= state.total_rounds;
    if (isLastRound) {
      return { ...stripPauseFields(state), segment: 'done', segment_started_at: null };
    }
    return withSegmentAnchor(state, 'work', state.round_index + 1, anchorMs);
  }

  return state;
}

export function tabataSegmentLabel(segment: TabataSegment, opts?: { isPaused?: boolean }): string {
  if (opts?.isPaused && (segment === 'setup' || segment === 'work' || segment === 'rest')) {
    return 'Paused';
  }
  switch (segment) {
    case 'setup':
      return 'Get Ready';
    case 'work':
      return 'Work';
    case 'rest':
      return 'Rest';
    case 'done':
      return 'Complete';
    default:
      return 'Ready';
  }
}

export function tabataMechanicsStateToJson(state: TabataMechanicsState): Record<string, unknown> {
  const base: Record<string, unknown> = {
    segment: state.segment,
    round_index: state.round_index,
    total_rounds: state.total_rounds,
    work_seconds: state.work_seconds,
    rest_seconds: state.rest_seconds,
    setup_seconds: state.setup_seconds,
    segment_started_at: state.segment_started_at,
  };
  if (state.is_paused === true) {
    base.is_paused = true;
    if (state.elapsed_in_segment != null) {
      base.elapsed_in_segment = state.elapsed_in_segment;
    }
  }
  return base;
}
