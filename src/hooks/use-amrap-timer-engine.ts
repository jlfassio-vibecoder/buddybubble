'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  amrapTimerReducer,
  createInitialAmrapTimerState,
  deriveAmrapTimerSnapshot,
} from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import type { AmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';
import type { AmrapTimerSnapshot } from '@/lib/workout-factory/interval-timer/amrap-timer-engine';

export function useAmrapTimerEngine(config: AmrapTimerConfig): {
  snapshot: AmrapTimerSnapshot;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
} {
  const [state, dispatch] = useReducer(amrapTimerReducer, config, createInitialAmrapTimerState);

  const stateRef = useRef(state);
  stateRef.current = state;

  const [, setTick] = useReducer((x: number) => x + 1, 0);

  const snapshot = deriveAmrapTimerSnapshot(state, Date.now());

  useEffect(() => {
    const phase = stateRef.current.phase;
    if (phase !== 'running') return;

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = Date.now();
      const current = deriveAmrapTimerSnapshot(stateRef.current, now);
      if (current.phase === 'running' && current.remainingMs <= 0) {
        dispatch({ type: 'tick', now });
      }
      setTick();
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.pausedAtMs, state.phaseAnchorMs]);

  const start = useCallback(() => {
    dispatch({ type: 'start', now: Date.now() });
    setTick();
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'pause', now: Date.now() });
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: 'resume', now: Date.now() });
    setTick();
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
    setTick();
  }, []);

  return {
    snapshot,
    start,
    pause,
    resume,
    reset,
  };
}
