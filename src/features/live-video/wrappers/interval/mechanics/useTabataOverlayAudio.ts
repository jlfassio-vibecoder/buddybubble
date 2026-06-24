'use client';

import { useEffect, useMemo, useRef } from 'react';

import { isTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import {
  tabataOverlayAudioIsActive,
  tabataOverlayCueSegmentKey,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-overlay-display';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { useIntervalCountdownAudio } from '@/hooks/use-interval-countdown-audio';
import { useTimerAudioPreference } from '@/hooks/use-timer-audio-preference';
import { getWorkoutTimerAudioPlayer } from '@/lib/timer/audio-cue-player';

export function useTabataOverlayAudio(engine: IntervalSessionEngine): {
  audioEnabled: boolean;
  toggleAudio: () => void;
} {
  const { audioEnabled, toggleAudio } = useTimerAudioPreference();

  const tabataState = useMemo(
    () => (isTabataMechanicsState(engine.mechanicsState) ? engine.mechanicsState : null),
    [engine.mechanicsState],
  );

  const cueSegmentKey = useMemo(() => {
    if (!tabataState) return 'idle';
    return tabataOverlayCueSegmentKey(tabataState);
  }, [tabataState]);

  const isActive = tabataOverlayAudioIsActive(engine, tabataState);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!wasActiveRef.current && isActive) {
      void getWorkoutTimerAudioPlayer()
        .prime()
        .catch(() => {});
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  useIntervalCountdownAudio({
    remainingMs: engine.remainingSec * 1000,
    cueSegmentKey,
    audioEnabled,
    isActive,
  });

  return { audioEnabled, toggleAudio };
}
