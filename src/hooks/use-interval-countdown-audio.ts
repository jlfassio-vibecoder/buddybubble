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

function resetAudioCueDedupeRefs(refs: {
  lastTickSecRef: { current: number | null };
  lastEndSegmentRef: { current: string | null };
  tenSecWarnedRef: { current: boolean };
}): void {
  refs.lastTickSecRef.current = null;
  refs.lastEndSegmentRef.current = null;
  refs.tenSecWarnedRef.current = false;
}

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
  const wasActiveRef = useRef(false);

  const dedupeRefs = { lastTickSecRef, lastEndSegmentRef, tenSecWarnedRef };

  // Re-arm cues when a run starts again (e.g. AMRAP Restart with cueSegmentKey still 'global').
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!wasActive && isActive) {
      resetAudioCueDedupeRefs(dedupeRefs);
      lastSegmentRef.current = null;
    }
  }, [isActive]);

  useEffect(() => {
    if (!audioEnabled || !isActive) return;

    const player = getWorkoutTimerAudioPlayer();

    if (cueSegmentKey !== lastSegmentRef.current) {
      lastSegmentRef.current = cueSegmentKey;
      resetAudioCueDedupeRefs(dedupeRefs);
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
