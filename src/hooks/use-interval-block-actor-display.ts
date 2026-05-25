'use client';

import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { AnyActorRef } from 'xstate';
import { deriveAmrapTimerSnapshot } from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import { deriveEmomTimerSnapshot } from '@/lib/workout-factory/interval-timer/emom-timer-engine';
import { deriveIntervalTimerSnapshot } from '@/lib/workout-factory/interval-timer/interval-timer-engine';
import {
  enginesEqual,
  type IntervalEngineState,
} from '@/lib/workout-factory/interval-timer/interval-engine-state';

function selectEngine(snapshot: { context: { engine: IntervalEngineState } }): IntervalEngineState {
  return snapshot.context.engine;
}

export function useIntervalBlockEngine(intervalBlockRef: AnyActorRef | null | undefined) {
  return useSelector(intervalBlockRef ?? undefined, selectEngine, enginesEqual);
}

export function useIntervalBlockAmrapRoundCount(intervalBlockRef: AnyActorRef | null | undefined) {
  return useSelector(
    intervalBlockRef ?? undefined,
    (snapshot) => snapshot.context.amrapRoundCount as number,
  );
}

/** Live elapsed ms for TimerDisplay — reads actor snapshot + Date.now() each rAF tick. */
export function useIntervalBlockGetElapsedMs(intervalBlockRef: AnyActorRef | null | undefined) {
  return useCallback(() => {
    if (!intervalBlockRef) return 0;
    const { engine } = intervalBlockRef.getSnapshot().context;
    const now = Date.now();

    switch (engine.format) {
      case 'tabata': {
        const live = deriveIntervalTimerSnapshot(engine.state, now);
        return Math.max(0, live.phaseDurationMs - live.remainingMs);
      }
      case 'emom': {
        const live = deriveEmomTimerSnapshot(engine.state, now);
        return Math.max(0, live.intervalMs - live.remainingMs);
      }
      case 'amrap': {
        const live = deriveAmrapTimerSnapshot(engine.state, now);
        return live.elapsedMs;
      }
      default:
        return 0;
    }
  }, [intervalBlockRef]);
}

export function deriveTabataDisplayFromEngine(engine: IntervalEngineState, now = Date.now()) {
  if (engine.format !== 'tabata') return null;
  return deriveIntervalTimerSnapshot(engine.state, now);
}

export function deriveEmomDisplayFromEngine(engine: IntervalEngineState, now = Date.now()) {
  if (engine.format !== 'emom') return null;
  return deriveEmomTimerSnapshot(engine.state, now);
}

export function deriveAmrapDisplayFromEngine(engine: IntervalEngineState, now = Date.now()) {
  if (engine.format !== 'amrap') return null;
  return deriveAmrapTimerSnapshot(engine.state, now);
}
