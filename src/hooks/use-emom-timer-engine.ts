'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  createInitialEmomTimerState,
  deriveEmomTimerSnapshot,
  emomTimerReducer,
} from '@/lib/workout-factory/interval-timer/emom-timer-engine';
import type { EmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import type { EmomTimerSnapshot } from '@/lib/workout-factory/interval-timer/emom-timer-engine';

export function useEmomTimerEngine(config: EmomTimerConfig): {
  snapshot: EmomTimerSnapshot;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
} {
  const [state, dispatch] = useReducer(emomTimerReducer, config, createInitialEmomTimerState);

  const stateRef = useRef(state);
  stateRef.current = state;

  const [, setTick] = useReducer((x: number) => x + 1, 0);

  const snapshot = deriveEmomTimerSnapshot(state, Date.now());

  useEffect(() => {
    const phase = stateRef.current.phase;
    if (phase !== 'running') return;

    let frame = 0;
    let lastSecond = -1;
    let lastPhaseKey = '';

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = Date.now();
      const current = deriveEmomTimerSnapshot(stateRef.current, now);

      if (current.phase === 'running' && current.remainingMs <= 0) {
        dispatch({ type: 'tick', now });
        lastSecond = -1;
        lastPhaseKey = '';
        setTick();
        return;
      }

      const elapsedMs = current.intervalMs - current.remainingMs;
      const currentSecond = Math.floor(elapsedMs / 1000);
      const phaseKey = `${current.phase}:${current.roundIndex}`;

      if (currentSecond !== lastSecond || phaseKey !== lastPhaseKey) {
        lastSecond = currentSecond;
        lastPhaseKey = phaseKey;
        setTick();
      }
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
