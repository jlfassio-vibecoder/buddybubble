'use client';

import { useCallback } from 'react';
import { getWorkoutTimerAudioPlayer } from '@/lib/timer/audio-cue-player';
import { useIntervalCountdownAudio } from '@/hooks/use-interval-countdown-audio';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';
import { useTimerAudioPreference } from '@/hooks/use-timer-audio-preference';

export function useIntervalShellPolish(options: {
  isRunning: boolean;
  isPaused: boolean;
  remainingMs: number;
  cueSegmentKey: string;
  amrapTenSecondWarning?: boolean;
}): {
  audioEnabled: boolean;
  toggleAudio: () => void;
  primeAudio: () => Promise<void>;
} {
  const { isRunning, isPaused, remainingMs, cueSegmentKey, amrapTenSecondWarning } = options;
  const { audioEnabled, toggleAudio } = useTimerAudioPreference();
  const isActive = isRunning && !isPaused;

  useScreenWakeLock(isActive);

  useIntervalCountdownAudio({
    remainingMs,
    cueSegmentKey,
    audioEnabled,
    isActive,
    amrapTenSecondWarning,
  });

  const primeAudio = useCallback(async () => {
    await getWorkoutTimerAudioPlayer().prime();
  }, []);

  return { audioEnabled, toggleAudio, primeAudio };
}
