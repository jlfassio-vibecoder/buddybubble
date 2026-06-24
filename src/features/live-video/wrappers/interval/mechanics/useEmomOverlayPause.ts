'use client';

import type { SessionStatus } from '@/features/live-video/state/sessionStateMachine';
import {
  freezeEmomMechanicsStateForPause,
  isEmomHostAutoAdvanceSegment,
  isEmomSegmentRunnable,
  isEmomTimerFrozen,
  parseEmomMechanicsState,
  unfreezeEmomMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import {
  useIntervalOverlayPause,
  type IntervalOverlayPauseControls,
} from '@/features/live-video/wrappers/interval/mechanics/useIntervalOverlayPause';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function useEmomOverlayPause(options: {
  isHost: boolean;
  sessionStatus: SessionStatus;
  engine: IntervalSessionEngine;
}): IntervalOverlayPauseControls {
  return useIntervalOverlayPause({
    ...options,
    parseState: parseEmomMechanicsState,
    isRunnable: isEmomSegmentRunnable,
    isHostAutoAdvance: isEmomHostAutoAdvanceSegment,
    isTimerFrozen: isEmomTimerFrozen,
    freeze: freezeEmomMechanicsStateForPause,
    unfreeze: unfreezeEmomMechanicsStateForResume,
  });
}
