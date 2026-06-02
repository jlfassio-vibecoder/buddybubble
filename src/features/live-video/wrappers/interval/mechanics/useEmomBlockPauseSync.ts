'use client';

import { useEffect, useRef } from 'react';

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
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!isHost || !engine.advanceSegment) {
      prevStatusRef.current = sessionStatus;
      return;
    }

    const ms = engine.mechanicsState;
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

    if (syncingRef.current) return;

    const now = Date.now();

    if (prev === 'running' && sessionStatus === 'paused') {
      syncingRef.current = true;
      const frozen = freezeEmomMechanicsStateForPause(ms, now);
      void engine.advanceSegment(frozen).finally(() => {
        syncingRef.current = false;
      });
      return;
    }

    if (prev === 'paused' && sessionStatus === 'running') {
      syncingRef.current = true;
      const resumed = unfreezeEmomMechanicsStateForResume(ms, now);
      void engine.advanceSegment(resumed).finally(() => {
        syncingRef.current = false;
      });
    }
  }, [isHost, sessionStatus, engine, engine.advanceSegment, engine.mechanicsState]);
}
