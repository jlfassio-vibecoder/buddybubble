'use client';

import { useEffect, useRef } from 'react';

import { runIntervalMechanicsAdvance } from '@/features/live-video/wrappers/interval/mechanics/interval-mechanics-advance-guard';
import type { SessionStatus } from '@/features/live-video/state/sessionStateMachine';
import {
  freezeEmomMechanicsStateForPause,
  isEmomSegmentRunnable,
  unfreezeEmomMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function useEmomBlockPauseSync(options: {
  isHost: boolean;
  sessionStatus: SessionStatus;
  engine: IntervalSessionEngine;
}): void {
  const { isHost, sessionStatus, engine } = options;
  const prevStatusRef = useRef<SessionStatus>(sessionStatus);
  const engineRef = useRef(engine);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    const e = engineRef.current;
    if (!isHost || !e.advanceSegment) {
      prevStatusRef.current = sessionStatus;
      return;
    }

    const ms = e.mechanicsState;
    if (!ms || ms.segment === undefined || !('minute_index' in ms)) {
      prevStatusRef.current = sessionStatus;
      return;
    }
    if (!isEmomSegmentRunnable(ms)) {
      prevStatusRef.current = sessionStatus;
      return;
    }

    const prev = prevStatusRef.current;
    prevStatusRef.current = sessionStatus;

    const now = Date.now();

    if (prev === 'running' && sessionStatus === 'paused') {
      const frozen = freezeEmomMechanicsStateForPause(ms, now);
      void runIntervalMechanicsAdvance(() => e.advanceSegment!(frozen));
      return;
    }

    if (prev === 'paused' && sessionStatus === 'running') {
      const resumed = unfreezeEmomMechanicsStateForResume(ms, now);
      void runIntervalMechanicsAdvance(() => e.advanceSegment!(resumed));
    }
  }, [isHost, sessionStatus, engine.advanceSegment, engine.mechanicsState]);
}
