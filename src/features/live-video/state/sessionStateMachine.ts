/** Workout block the host has selected (lobby = no block yet). */
export type SessionPhase = 'lobby' | 'warmup' | 'amrap' | 'tabata';

/** Global session: idle until Start Session; running/paused until End Session. */
export type SessionStatus = 'idle' | 'running' | 'paused';

export type SessionAspectRatioId = '16:9' | '9:16' | '1:1';

export type SessionState = {
  phase: SessionPhase;
  status: SessionStatus;
  globalStartedAt: number | null;
  blockStartedAt: number | null;
  blockPausedAt: number | null;
  /** Host-synced global aspect ratio for the live video stage. */
  aspectRatio: SessionAspectRatioId;
  /**
   * Host-selected `live_session_deck_items.id` for the workout player / queue highlight.
   * Matches participant deck row ids; null when nothing selected or row not yet persisted.
   */
  activeDeckItemId: string | null;
  /** Monotonic generation counter to help clients ignore stale out-of-order events. */
  generation: number;
};

export const initialSessionState: SessionState = {
  phase: 'lobby',
  status: 'idle',
  globalStartedAt: null,
  blockStartedAt: null,
  blockPausedAt: null,
  aspectRatio: '16:9',
  activeDeckItemId: null,
  generation: 0,
};

/** Elapsed ms for the current block (0 in lobby or without a started block). */
export function getBlockElapsedMs(state: SessionState, now: number): number {
  if (state.phase === 'lobby' || state.blockStartedAt === null) return 0;
  if (state.status === 'paused' && state.blockPausedAt !== null) {
    return Math.max(0, state.blockPausedAt - state.blockStartedAt);
  }
  return Math.max(0, now - state.blockStartedAt);
}

/** Start global session; host picks block phase separately via transitionToPhase. */
export function startSession(state: SessionState, now: number): SessionState {
  if (state.status !== 'idle') return state;
  return {
    ...state,
    status: 'running',
    globalStartedAt: now,
    // Stay in lobby until user taps a phase; blockStartedAt set on first transitionToPhase.
  };
}

export function transitionToPhase(
  state: SessionState,
  targetPhase: SessionPhase,
  now: number,
): SessionState {
  if (state.status === 'idle') return state;
  if (targetPhase === 'lobby') {
    return {
      ...state,
      phase: 'lobby',
      status: 'running',
      blockStartedAt: null,
      blockPausedAt: null,
    };
  }
  return {
    ...state,
    status: 'running',
    phase: targetPhase,
    blockStartedAt: now,
    blockPausedAt: null,
  };
}

export function pauseBlock(state: SessionState, timestamp: number): SessionState {
  if (state.status !== 'running' || state.blockStartedAt === null) return state;
  return {
    ...state,
    status: 'paused',
    blockPausedAt: timestamp,
  };
}

export function resumeBlock(state: SessionState, timestamp: number): SessionState {
  if (state.status !== 'paused' || state.blockPausedAt === null || state.blockStartedAt === null) {
    return state;
  }
  const pauseMs = timestamp - state.blockPausedAt;
  return {
    ...state,
    status: 'running',
    blockStartedAt: state.blockStartedAt + pauseMs,
    blockPausedAt: null,
  };
}

export function setAspectRatio(
  state: SessionState,
  aspectRatio: SessionAspectRatioId,
): SessionState {
  if (state.aspectRatio === aspectRatio) return state;
  return { ...state, aspectRatio };
}

export function setActiveDeckItem(state: SessionState, id: string | null): SessionState {
  if (state.activeDeckItemId === id) return state;
  return { ...state, activeDeckItemId: id };
}

export function endSession(_state: SessionState): SessionState {
  return { ...initialSessionState, generation: _state.generation + 1 };
}
