'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { runIntervalMechanicsAdvance } from '@/features/live-video/wrappers/interval/mechanics/interval-mechanics-advance-guard';
import type { SessionStatus } from '@/features/live-video/state/sessionStateMachine';
import type {
  IntervalSessionEngine,
  IntervalMechanicsState,
  IntervalTimerPhase,
} from '@/features/live-video/wrappers/interval/types/interval-engine';

export type IntervalOverlayPauseControls = {
  showHostControls: boolean;
  canPause: boolean;
  canResume: boolean;
  isFrozen: boolean;
  pause: () => void;
  resume: () => void;
};

type MechanicsWithPause = {
  is_paused?: boolean;
  segment_started_at: string | null;
};

export function resolveIntervalOverlayPauseVisibility<T extends MechanicsWithPause>(options: {
  isHost: boolean;
  sessionStatus: SessionStatus;
  timerPhase: IntervalTimerPhase;
  mechanicsState: unknown;
  parseState: (raw: unknown) => T | null;
  isRunnable: (state: T) => boolean;
  isHostAutoAdvance: (state: T) => boolean;
  isTimerFrozen: (state: T) => boolean;
  hasAdvanceSegment: boolean;
}): {
  showHostControls: boolean;
  canPause: boolean;
  canResume: boolean;
  isFrozen: boolean;
  state: T | null;
} {
  const {
    isHost,
    sessionStatus,
    timerPhase,
    mechanicsState,
    parseState,
    isRunnable,
    isHostAutoAdvance,
    isTimerFrozen,
    hasAdvanceSegment,
  } = options;

  const state = parseState(mechanicsState);
  const isFrozen = state != null && isTimerFrozen(state);

  const showHostControls =
    isHost &&
    sessionStatus !== 'paused' &&
    hasAdvanceSegment &&
    timerPhase !== 'idle' &&
    timerPhase !== 'finished' &&
    state != null &&
    isRunnable(state);

  const canResume = showHostControls && isFrozen;
  const canPause = showHostControls && !isFrozen && state != null && isHostAutoAdvance(state);

  return { showHostControls, canPause, canResume, isFrozen, state };
}

export type UseIntervalOverlayPauseOptions<T extends MechanicsWithPause> = {
  isHost: boolean;
  sessionStatus: SessionStatus;
  engine: IntervalSessionEngine;
  parseState: (raw: unknown) => T | null;
  isRunnable: (state: T) => boolean;
  isHostAutoAdvance: (state: T) => boolean;
  isTimerFrozen: (state: T) => boolean;
  freeze: (state: T, nowMs: number) => T;
  unfreeze: (state: T, nowMs: number) => T;
};

export function useIntervalOverlayPause<T extends MechanicsWithPause>(
  options: UseIntervalOverlayPauseOptions<T>,
): IntervalOverlayPauseControls {
  const {
    isHost,
    sessionStatus,
    engine,
    parseState,
    isRunnable,
    isHostAutoAdvance,
    isTimerFrozen,
    freeze,
    unfreeze,
  } = options;

  const engineRef = useRef(engine);
  const visibilityRef = useRef({ canPause: false, canResume: false });
  const parseStateRef = useRef(parseState);
  const freezeRef = useRef(freeze);
  const unfreezeRef = useRef(unfreeze);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    parseStateRef.current = parseState;
    freezeRef.current = freeze;
    unfreezeRef.current = unfreeze;
  }, [parseState, freeze, unfreeze]);

  const visibility = useMemo(
    () =>
      resolveIntervalOverlayPauseVisibility({
        isHost,
        sessionStatus,
        timerPhase: engine.timerPhase,
        mechanicsState: engine.mechanicsState,
        parseState,
        isRunnable,
        isHostAutoAdvance,
        isTimerFrozen,
        hasAdvanceSegment: engine.advanceSegment != null,
      }),
    [
      isHost,
      sessionStatus,
      engine.timerPhase,
      engine.mechanicsState,
      engine.advanceSegment,
      parseState,
      isRunnable,
      isHostAutoAdvance,
      isTimerFrozen,
    ],
  );

  useEffect(() => {
    visibilityRef.current = {
      canPause: visibility.canPause,
      canResume: visibility.canResume,
    };
  }, [visibility.canPause, visibility.canResume]);

  const pause = useCallback(() => {
    if (!visibilityRef.current.canPause) return;

    const e = engineRef.current;
    if (!e.advanceSegment) return;

    const ms = parseStateRef.current(e.mechanicsState);
    if (!ms) return;

    const frozen = freezeRef.current(ms, Date.now());
    void runIntervalMechanicsAdvance(() =>
      e.advanceSegment!(frozen as unknown as IntervalMechanicsState),
    );
  }, []);

  const resume = useCallback(() => {
    if (!visibilityRef.current.canResume) return;

    const e = engineRef.current;
    if (!e.advanceSegment) return;

    const ms = parseStateRef.current(e.mechanicsState);
    if (!ms) return;

    const resumed = unfreezeRef.current(ms, Date.now());
    void runIntervalMechanicsAdvance(() =>
      e.advanceSegment!(resumed as unknown as IntervalMechanicsState),
    );
  }, []);

  return {
    showHostControls: visibility.showHostControls,
    canPause: visibility.canPause,
    canResume: visibility.canResume,
    isFrozen: visibility.isFrozen,
    pause,
    resume,
  };
}
