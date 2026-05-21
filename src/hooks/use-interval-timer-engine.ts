'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  createInitialIntervalTimerState,
  deriveIntervalTimerSnapshot,
  intervalTimerReducer,
} from '@/lib/workout-factory/interval-timer/interval-timer-engine';
import type {
  IntervalTimerConfig,
  IntervalTimerSnapshot,
} from '@/lib/workout-factory/interval-timer/types';

export function useIntervalTimerEngine(config: IntervalTimerConfig): {
  snapshot: IntervalTimerSnapshot;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
} {
  const [state, dispatch] = useReducer(
    intervalTimerReducer,
    config,
    createInitialIntervalTimerState,
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const [, setTick] = useReducer((x: number) => x + 1, 0);

  const snapshot = deriveIntervalTimerSnapshot(state, Date.now());

  useEffect(() => {
    const phase = stateRef.current.phase;
    const shouldRun = phase === 'work' || phase === 'rest' || phase === 'prepare';
    if (!shouldRun) return;

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = Date.now();
      const current = deriveIntervalTimerSnapshot(stateRef.current, now);
      if (
        (current.phase === 'work' || current.phase === 'rest' || current.phase === 'prepare') &&
        current.remainingMs <= 0
      ) {
        dispatch({ type: 'tick', now });
      }
      setTick();
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.roundIndex, state.pausedAtMs, state.phaseAnchorMs]);

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
