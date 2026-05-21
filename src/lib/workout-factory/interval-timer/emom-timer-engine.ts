import type { EmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';

export type EmomTimerPhase = 'idle' | 'running' | 'paused' | 'done';

export type EmomTimerEngineState = {
  config: EmomTimerConfig;
  phase: EmomTimerPhase;
  /** 0-based current interval / minute slot */
  roundIndex: number;
  phaseAnchorMs: number | null;
  pausedTotalMs: number;
  pausedAtMs: number | null;
};

export type EmomTimerSnapshot = {
  phase: EmomTimerPhase;
  roundIndex: number;
  remainingMs: number;
  intervalMs: number;
  isRunning: boolean;
  isPaused: boolean;
  totalRounds: number;
  displayRound: number;
};

export type EmomTimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' }
  | { type: 'tick'; now: number };

export function createInitialEmomTimerState(config: EmomTimerConfig): EmomTimerEngineState {
  return {
    config,
    phase: 'idle',
    roundIndex: 0,
    phaseAnchorMs: null,
    pausedTotalMs: 0,
    pausedAtMs: null,
  };
}

function effectiveNow(state: EmomTimerEngineState, now: number): number {
  if (state.phase === 'paused' && state.pausedAtMs != null) {
    return state.pausedAtMs;
  }
  return now;
}

export function getEmomElapsedInIntervalMs(state: EmomTimerEngineState, now: number): number {
  if (state.phase !== 'running' && state.phase !== 'paused') return 0;
  if (state.phaseAnchorMs == null) return 0;
  const t = effectiveNow(state, now);
  return Math.max(0, t - state.phaseAnchorMs - state.pausedTotalMs);
}

export function getEmomRemainingMs(state: EmomTimerEngineState, now: number): number {
  if (state.phase === 'idle') return state.config.intervalMs;
  if (state.phase === 'done') return 0;
  const elapsed = getEmomElapsedInIntervalMs(state, now);
  return Math.max(0, state.config.intervalMs - elapsed);
}

function advanceToNextRoundOrDone(state: EmomTimerEngineState, now: number): EmomTimerEngineState {
  const { config, roundIndex } = state;
  const isLastRound = roundIndex >= config.totalRounds - 1;

  if (isLastRound) {
    return {
      ...state,
      phase: 'done',
      phaseAnchorMs: null,
      pausedAtMs: null,
    };
  }

  return {
    ...state,
    roundIndex: roundIndex + 1,
    phaseAnchorMs: now,
    pausedTotalMs: 0,
    pausedAtMs: null,
  };
}

export function emomTimerReducer(
  state: EmomTimerEngineState,
  action: EmomTimerAction,
): EmomTimerEngineState {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'idle' && state.phase !== 'done') return state;
      return {
        ...state,
        phase: 'running',
        roundIndex: 0,
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
      return createInitialEmomTimerState(state.config);

    case 'tick': {
      if (state.phase !== 'running') return state;
      if (getEmomRemainingMs(state, action.now) > 0) return state;
      return advanceToNextRoundOrDone(state, action.now);
    }

    default:
      return state;
  }
}

export function deriveEmomTimerSnapshot(
  state: EmomTimerEngineState,
  now: number,
): EmomTimerSnapshot {
  const remainingMs = getEmomRemainingMs(state, now);
  const isPaused = state.phase === 'paused';
  const isRunning = state.phase === 'running' || isPaused;

  return {
    phase: state.phase,
    roundIndex: state.roundIndex,
    remainingMs,
    intervalMs: state.config.intervalMs,
    isRunning,
    isPaused,
    totalRounds: state.config.totalRounds,
    displayRound: state.roundIndex + 1,
  };
}
