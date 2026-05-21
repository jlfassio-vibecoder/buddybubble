import type { AmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';

export type AmrapTimerPhase = 'idle' | 'running' | 'paused' | 'done';

export type AmrapTimerEngineState = {
  config: AmrapTimerConfig;
  phase: AmrapTimerPhase;
  phaseAnchorMs: number | null;
  pausedTotalMs: number;
  pausedAtMs: number | null;
};

export type AmrapTimerSnapshot = {
  phase: AmrapTimerPhase;
  remainingMs: number;
  timeCapMs: number;
  isRunning: boolean;
  isPaused: boolean;
  elapsedMs: number;
};

export type AmrapTimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' }
  | { type: 'tick'; now: number };

export function createInitialAmrapTimerState(config: AmrapTimerConfig): AmrapTimerEngineState {
  return {
    config,
    phase: 'idle',
    phaseAnchorMs: null,
    pausedTotalMs: 0,
    pausedAtMs: null,
  };
}

function effectiveNow(state: AmrapTimerEngineState, now: number): number {
  if (state.phase === 'paused' && state.pausedAtMs != null) {
    return state.pausedAtMs;
  }
  return now;
}

export function getAmrapElapsedMs(state: AmrapTimerEngineState, now: number): number {
  if (state.phase !== 'running' && state.phase !== 'paused') return 0;
  if (state.phaseAnchorMs == null) return 0;
  const t = effectiveNow(state, now);
  return Math.max(0, t - state.phaseAnchorMs - state.pausedTotalMs);
}

export function getAmrapRemainingMs(state: AmrapTimerEngineState, now: number): number {
  if (state.phase === 'idle') return state.config.timeCapMs;
  if (state.phase === 'done') return 0;
  const elapsed = getAmrapElapsedMs(state, now);
  return Math.max(0, state.config.timeCapMs - elapsed);
}

export function amrapTimerReducer(
  state: AmrapTimerEngineState,
  action: AmrapTimerAction,
): AmrapTimerEngineState {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'idle' && state.phase !== 'done') return state;
      return {
        ...state,
        phase: 'running',
        phaseAnchorMs: action.now,
        pausedTotalMs: 0,
        pausedAtMs: null,
      };
    }

    case 'pause': {
      if (state.phase !== 'running') return state;
      return {
        ...state,
        phase: 'paused',
        pausedAtMs: action.now,
      };
    }

    case 'resume': {
      if (state.phase !== 'paused' || state.pausedAtMs == null) return state;
      const pauseDelta = action.now - state.pausedAtMs;
      return {
        ...state,
        phase: 'running',
        pausedTotalMs: state.pausedTotalMs + pauseDelta,
        pausedAtMs: null,
      };
    }

    case 'reset':
      return createInitialAmrapTimerState(state.config);

    case 'tick': {
      if (state.phase !== 'running') return state;
      if (getAmrapRemainingMs(state, action.now) > 0) return state;
      return {
        ...state,
        phase: 'done',
        phaseAnchorMs: null,
        pausedAtMs: null,
      };
    }

    default:
      return state;
  }
}

export function deriveAmrapTimerSnapshot(
  state: AmrapTimerEngineState,
  now: number,
): AmrapTimerSnapshot {
  const remainingMs = getAmrapRemainingMs(state, now);
  const elapsedMs = getAmrapElapsedMs(state, now);
  const isPaused = state.phase === 'paused';
  const isRunning = state.phase === 'running' || isPaused;

  return {
    phase: state.phase,
    remainingMs,
    timeCapMs: state.config.timeCapMs,
    isRunning,
    isPaused,
    elapsedMs,
  };
}
