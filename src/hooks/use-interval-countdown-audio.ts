'use client';

import { useEffect, useRef } from 'react';
import type { AudioCuePlayer } from '@/lib/timer/audio-cue-player';
import { getWorkoutTimerAudioPlayer } from '@/lib/timer/audio-cue-player';

export type IntervalCountdownAudioInput = {
  /** Static path (V1 hooks re-render each second). */
  remainingMs?: number;
  /** Live path (machine actor). Takes precedence when provided. */
  getRemainingMs?: () => number;
  cueSegmentKey: string;
  audioEnabled: boolean;
  isActive: boolean;
  amrapTenSecondWarning?: boolean;
};

type AudioCueDedupeRefs = {
  lastSegmentRef: { current: string | null };
  lastTickSecRef: { current: number | null };
  lastEndSegmentRef: { current: string | null };
  tenSecWarnedRef: { current: boolean };
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

/** Shared cue evaluation for static useEffect and live rAF paths. */
export function evaluateIntervalCountdownCues(
  player: AudioCuePlayer,
  remainingSec: number,
  cueSegmentKey: string,
  amrapTenSecondWarning: boolean,
  refs: AudioCueDedupeRefs,
): void {
  if (cueSegmentKey !== refs.lastSegmentRef.current) {
    refs.lastSegmentRef.current = cueSegmentKey;
    resetAudioCueDedupeRefs(refs);
  }

  if (amrapTenSecondWarning && remainingSec === 10 && !refs.tenSecWarnedRef.current) {
    refs.tenSecWarnedRef.current = true;
    player.play('amrap_ten_second');
  }

  if (remainingSec > 0 && remainingSec <= 3 && refs.lastTickSecRef.current !== remainingSec) {
    refs.lastTickSecRef.current = remainingSec;
    player.play('countdown_tick');
  }

  if (remainingSec === 0 && refs.lastEndSegmentRef.current !== cueSegmentKey) {
    refs.lastEndSegmentRef.current = cueSegmentKey;
    player.play('countdown_end');
  }
}

export function useIntervalCountdownAudio(input: IntervalCountdownAudioInput): void {
  const {
    remainingMs,
    getRemainingMs,
    cueSegmentKey,
    audioEnabled,
    isActive,
    amrapTenSecondWarning = false,
  } = input;

  const useLivePath = getRemainingMs != null;
  const remainingSec =
    !useLivePath && remainingMs != null ? Math.ceil(Math.max(0, remainingMs) / 1000) : 0;

  const lastSegmentRef = useRef<string | null>(null);
  const lastTickSecRef = useRef<number | null>(null);
  const lastEndSegmentRef = useRef<string | null>(null);
  const tenSecWarnedRef = useRef(false);
  const wasActiveRef = useRef(false);

  const dedupeRefs: AudioCueDedupeRefs = {
    lastSegmentRef,
    lastTickSecRef,
    lastEndSegmentRef,
    tenSecWarnedRef,
  };

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
    if (useLivePath || !audioEnabled || !isActive) return;

    const player = getWorkoutTimerAudioPlayer();
    evaluateIntervalCountdownCues(
      player,
      remainingSec,
      cueSegmentKey,
      amrapTenSecondWarning,
      dedupeRefs,
    );
  }, [useLivePath, audioEnabled, isActive, remainingSec, cueSegmentKey, amrapTenSecondWarning]);

  useEffect(() => {
    if (!useLivePath || !getRemainingMs || !audioEnabled || !isActive) return;

    const player = getWorkoutTimerAudioPlayer();
    let frame = 0;

    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const remainingMsLive = getRemainingMs();
      const remainingSecLive = Math.ceil(Math.max(0, remainingMsLive) / 1000);
      evaluateIntervalCountdownCues(
        player,
        remainingSecLive,
        cueSegmentKey,
        amrapTenSecondWarning,
        dedupeRefs,
      );
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [useLivePath, getRemainingMs, audioEnabled, isActive, cueSegmentKey, amrapTenSecondWarning]);
}
