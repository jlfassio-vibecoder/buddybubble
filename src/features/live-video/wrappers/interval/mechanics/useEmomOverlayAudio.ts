'use client';

import { useEffect, useMemo, useRef } from 'react';

import { parseEmomMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import {
  emomOverlayAudioIsActive,
  emomOverlayCueSegmentKey,
} from '@/features/live-video/wrappers/interval/mechanics/emom-overlay-display';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { useIntervalCountdownAudio } from '@/hooks/use-interval-countdown-audio';
import { useTimerAudioPreference } from '@/hooks/use-timer-audio-preference';
import { getWorkoutTimerAudioPlayer } from '@/lib/timer/audio-cue-player';

function isEmomMechanicsState(ms: unknown): boolean {
  return parseEmomMechanicsState(ms) != null;
}

export function useEmomOverlayAudio(engine: IntervalSessionEngine): {
  audioEnabled: boolean;
  toggleAudio: () => void;
} {
  const { audioEnabled, toggleAudio } = useTimerAudioPreference();

  const emomState = useMemo(() => {
    if (!isEmomMechanicsState(engine.mechanicsState)) return null;
    return parseEmomMechanicsState(engine.mechanicsState);
  }, [engine.mechanicsState]);

  const cueSegmentKey = useMemo(() => {
    if (!emomState) return 'idle';
    return emomOverlayCueSegmentKey(emomState);
  }, [emomState]);

  const isActive = emomOverlayAudioIsActive(engine, emomState);
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
