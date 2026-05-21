import type {
  IntervalTimerAction,
  IntervalTimerConfig,
  IntervalTimerEngineState,
  IntervalTimerPhase,
  IntervalTimerSnapshot,
} from '@/lib/workout-factory/interval-timer/types';

export function createInitialIntervalTimerState(
  config: IntervalTimerConfig,
): IntervalTimerEngineState {
  return {
    config,
    phase: 'idle',
    roundIndex: 0,
    phaseAnchorMs: null,
    pausedTotalMs: 0,
    pausedAtMs: null,
    pausedFromPhase: null,
  };
}

function isRunnablePhase(phase: IntervalTimerPhase): phase is 'prepare' | 'work' | 'rest' {
  return phase === 'prepare' || phase === 'work' || phase === 'rest';
}

export function getPhaseDurationMs(state: IntervalTimerEngineState): number {
  const phase =
    state.phase === 'paused' && state.pausedFromPhase != null ? state.pausedFromPhase : state.phase;
  const { config } = state;
  switch (phase) {
    case 'prepare':
      return config.prepareMs;
    case 'work':
      return config.workMs;
    case 'rest':
      return config.restMs;
    default:
      return 0;
  }
}

function effectiveNow(state: IntervalTimerEngineState, now: number): number {
  if (state.phase === 'paused' && state.pausedAtMs != null) {
    return state.pausedAtMs;
  }
  return now;
}

export function getPhaseElapsedMs(state: IntervalTimerEngineState, now: number): number {
  const activePhase =
    state.phase === 'paused' && state.pausedFromPhase != null ? state.pausedFromPhase : state.phase;
  if (!isRunnablePhase(activePhase)) return 0;
  if (state.phaseAnchorMs == null) return 0;
  const t = effectiveNow(state, now);
  return Math.max(0, t - state.phaseAnchorMs - state.pausedTotalMs);
}

export function getPhaseRemainingMs(state: IntervalTimerEngineState, now: number): number {
  const activePhase =
    state.phase === 'paused' && state.pausedFromPhase != null ? state.pausedFromPhase : state.phase;
  if (!isRunnablePhase(activePhase)) {
    return getPhaseDurationMs(state);
  }
  const duration = getPhaseDurationMs(state);
  if (state.phaseAnchorMs == null) return duration;
  const t = effectiveNow(state, now);
  const elapsed = Math.max(0, t - state.phaseAnchorMs - state.pausedTotalMs);
  return Math.max(0, duration - elapsed);
}

function enterPhase(
  state: IntervalTimerEngineState,
  phase: 'prepare' | 'work' | 'rest',
  now: number,
  roundIndex: number,
): IntervalTimerEngineState {
  return {
    ...state,
    phase,
    roundIndex,
    phaseAnchorMs: now,
    pausedTotalMs: 0,
    pausedAtMs: null,
    pausedFromPhase: null,
  };
}

function advanceFromPrepare(
  state: IntervalTimerEngineState,
  now: number,
): IntervalTimerEngineState {
  return enterPhase(state, 'work', now, 0);
}

function advanceFromWork(state: IntervalTimerEngineState, now: number): IntervalTimerEngineState {
  const { config, roundIndex } = state;
  const isLastRound = roundIndex >= config.totalRounds - 1;

  if (config.restMs > 0) {
    return enterPhase(state, 'rest', now, roundIndex);
  }

  if (isLastRound) {
    return {
      ...state,
      phase: 'done',
      phaseAnchorMs: null,
      pausedAtMs: null,
      pausedFromPhase: null,
    };
  }

  return enterPhase(state, 'work', now, roundIndex + 1);
}

function advanceFromRest(state: IntervalTimerEngineState, now: number): IntervalTimerEngineState {
  const { config, roundIndex } = state;
  const isLastRound = roundIndex >= config.totalRounds - 1;

  if (isLastRound) {
    return {
      ...state,
      phase: 'done',
      phaseAnchorMs: null,
      pausedAtMs: null,
      pausedFromPhase: null,
    };
  }

  return enterPhase(state, 'work', now, roundIndex + 1);
}

function advancePhase(state: IntervalTimerEngineState, now: number): IntervalTimerEngineState {
  switch (state.phase) {
    case 'prepare':
      return advanceFromPrepare(state, now);
    case 'work':
      return advanceFromWork(state, now);
    case 'rest':
      return advanceFromRest(state, now);
    default:
      return state;
  }
}

export function intervalTimerReducer(
  state: IntervalTimerEngineState,
  action: IntervalTimerAction,
): IntervalTimerEngineState {
  switch (action.type) {
    case 'start': {
      if (state.phase !== 'idle' && state.phase !== 'done') return state;
      const { now } = action;
      if (state.config.prepareMs > 0) {
        return enterPhase({ ...state, phase: 'idle', roundIndex: 0 }, 'prepare', now, 0);
      }
      return enterPhase({ ...state, phase: 'idle', roundIndex: 0 }, 'work', now, 0);
    }

    case 'pause': {
      if (!isRunnablePhase(state.phase)) return state;
      return {
        ...state,
        phase: 'paused',
        pausedFromPhase: state.phase,
        pausedAtMs: action.now,
      };
    }

    case 'resume': {
      if (state.phase !== 'paused' || state.pausedFromPhase == null || state.pausedAtMs == null) {
        return state;
      }
      const pauseDelta = action.now - state.pausedAtMs;
      return {
        ...state,
        phase: state.pausedFromPhase,
        pausedTotalMs: state.pausedTotalMs + pauseDelta,
        pausedAtMs: null,
        pausedFromPhase: null,
      };
    }

    case 'reset':
      return createInitialIntervalTimerState(state.config);

    case 'tick': {
      if (!isRunnablePhase(state.phase)) return state;
      if (getPhaseRemainingMs(state, action.now) > 0) return state;
      return advancePhase(state, action.now);
    }

    default:
      return state;
  }
}

export function deriveIntervalTimerSnapshot(
  state: IntervalTimerEngineState,
  now: number,
): IntervalTimerSnapshot {
  const phaseDurationMs = getPhaseDurationMs(state);
  const remainingMs =
    state.phase === 'idle' || state.phase === 'done'
      ? phaseDurationMs
      : getPhaseRemainingMs(state, now);

  const isPaused = state.phase === 'paused';
  const isRunning = isRunnablePhase(state.phase) || isPaused;

  return {
    phase: state.phase,
    roundIndex: state.roundIndex,
    remainingMs,
    phaseDurationMs,
    isRunning,
    isPaused,
    totalRounds: state.config.totalRounds,
    displayRound: state.roundIndex + 1,
  };
}
