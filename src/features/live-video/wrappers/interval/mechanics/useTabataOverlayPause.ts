'use client';

import type { SessionStatus } from '@/features/live-video/state/sessionStateMachine';
import {
  freezeTabataMechanicsStateForPause,
  isTabataHostAutoAdvanceSegment,
  isTabataSegmentRunnable,
  isTabataTimerFrozen,
  parseTabataMechanicsState,
  unfreezeTabataMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import {
  useIntervalOverlayPause,
  type IntervalOverlayPauseControls,
} from '@/features/live-video/wrappers/interval/mechanics/useIntervalOverlayPause';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function useTabataOverlayPause(options: {
  isHost: boolean;
  sessionStatus: SessionStatus;
  engine: IntervalSessionEngine;
}): IntervalOverlayPauseControls {
  return useIntervalOverlayPause({
    ...options,
    parseState: parseTabataMechanicsState,
    isRunnable: isTabataSegmentRunnable,
    isHostAutoAdvance: isTabataHostAutoAdvanceSegment,
    isTimerFrozen: isTabataTimerFrozen,
    freeze: freezeTabataMechanicsStateForPause,
    unfreeze: unfreezeTabataMechanicsStateForResume,
  });
}
