'use client';

import { useEffect, useRef } from 'react';
import { getWorkoutTimerAudioPlayer } from '@/lib/timer/audio-cue-player';

export type IntervalCountdownAudioInput = {
  remainingMs: number;
  cueSegmentKey: string;
  audioEnabled: boolean;
  isActive: boolean;
  amrapTenSecondWarning?: boolean;
};

export function useIntervalCountdownAudio(input: IntervalCountdownAudioInput): void {
  const {
    remainingMs,
    cueSegmentKey,
    audioEnabled,
    isActive,
    amrapTenSecondWarning = false,
  } = input;

  const remainingSec = Math.ceil(Math.max(0, remainingMs) / 1000);

  const lastSegmentRef = useRef<string | null>(null);
  const lastTickSecRef = useRef<number | null>(null);
  const lastEndSegmentRef = useRef<string | null>(null);
  const tenSecWarnedRef = useRef(false);

  useEffect(() => {
    if (!audioEnabled || !isActive) return;

    const player = getWorkoutTimerAudioPlayer();

    if (cueSegmentKey !== lastSegmentRef.current) {
      lastSegmentRef.current = cueSegmentKey;
      lastTickSecRef.current = null;
      tenSecWarnedRef.current = false;
    }

    if (amrapTenSecondWarning && remainingSec === 10 && !tenSecWarnedRef.current) {
      tenSecWarnedRef.current = true;
      player.play('amrap_ten_second');
    }

    if (remainingSec > 0 && remainingSec <= 3 && lastTickSecRef.current !== remainingSec) {
      lastTickSecRef.current = remainingSec;
      player.play('countdown_tick');
    }

    if (remainingSec === 0 && lastEndSegmentRef.current !== cueSegmentKey) {
      lastEndSegmentRef.current = cueSegmentKey;
      player.play('countdown_end');
    }
  }, [audioEnabled, isActive, remainingSec, cueSegmentKey, amrapTenSecondWarning]);
}
