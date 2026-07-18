'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoloStudioRecorderStatus } from '@/features/live-video/hooks/useSoloStudioRecorder';
import {
  IDLE_TIMEOUT_MS,
  WARNING_COUNTDOWN_MS,
  isSoloStudioDurationPreset,
  overtimeTimeoutMs,
} from '@/features/live-video/hooks/studio-failsafe-constants';

export type StudioFailsafeWarningReason = 'idle' | 'overtime';

export type UseStudioFailsafeArgs = {
  enabled: boolean;
  estimatedDurationMin: number;
  recordingStatus: SoloStudioRecorderStatus;
  onForceExit: () => void | Promise<void>;
};

export type UseStudioFailsafeResult = {
  showWarning: boolean;
  warningReason: StudioFailsafeWarningReason | null;
  warningSecondsLeft: number | null;
  acknowledgeWarning: () => void;
};

export {
  DURATION_PRESETS_MIN,
  MAX_ESTIMATED_DURATION_MIN,
  OVERTIME_BUFFER_MIN,
  IDLE_TIMEOUT_MS,
  WARNING_COUNTDOWN_MS,
  FORCE_EXIT_UPLOAD_WAIT_MS,
  isSoloStudioDurationPreset,
  overtimeTimeoutMs,
} from '@/features/live-video/hooks/studio-failsafe-constants';

function clearTimer(ref: { current: ReturnType<typeof setTimeout> | null }) {
  if (ref.current != null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

function clearIntervalRef(ref: { current: ReturnType<typeof setInterval> | null }) {
  if (ref.current != null) {
    clearInterval(ref.current);
    ref.current = null;
  }
}

/**
 * Solo Studio billing failsafes: 5-minute idle (no Record) and estimated+5m overtime.
 * When either fires, shows a 30s warning; at 0 calls `onForceExit` once.
 */
export function useStudioFailsafe({
  enabled,
  estimatedDurationMin,
  recordingStatus,
  onForceExit,
}: UseStudioFailsafeArgs): UseStudioFailsafeResult {
  const [showWarning, setShowWarning] = useState(false);
  const [warningReason, setWarningReason] = useState<StudioFailsafeWarningReason | null>(null);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);
  /** Bumped to restart idle/overtime timers after ack or when re-arming. */
  const [timerEpoch, setTimerEpoch] = useState(0);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forceExitFiredRef = useRef(false);
  const onForceExitRef = useRef(onForceExit);
  onForceExitRef.current = onForceExit;

  const clearAllTimers = useCallback(() => {
    clearTimer(idleTimerRef);
    clearTimer(overtimeTimerRef);
    clearIntervalRef(warningIntervalRef);
  }, []);

  const armWarning = useCallback((reason: StudioFailsafeWarningReason) => {
    clearTimer(idleTimerRef);
    clearTimer(overtimeTimerRef);
    forceExitFiredRef.current = false;
    setWarningReason(reason);
    setShowWarning(true);
    setWarningSecondsLeft(Math.ceil(WARNING_COUNTDOWN_MS / 1000));
  }, []);

  const acknowledgeWarning = useCallback(() => {
    if (!showWarning) return;
    clearIntervalRef(warningIntervalRef);
    setShowWarning(false);
    setWarningReason(null);
    setWarningSecondsLeft(null);
    forceExitFiredRef.current = false;
    setTimerEpoch((n) => n + 1);
  }, [showWarning]);

  // Reset / tear down when disabled.
  useEffect(() => {
    if (!enabled || !isSoloStudioDurationPreset(estimatedDurationMin)) {
      clearAllTimers();
      setShowWarning(false);
      setWarningReason(null);
      setWarningSecondsLeft(null);
      forceExitFiredRef.current = false;
      return;
    }
    return () => {
      clearAllTimers();
    };
  }, [enabled, estimatedDurationMin, clearAllTimers]);

  // Overtime timer: wall clock from enable/ack only — do not restart on recordingStatus changes.
  useEffect(() => {
    if (!enabled || !isSoloStudioDurationPreset(estimatedDurationMin) || showWarning) {
      clearTimer(overtimeTimerRef);
      return;
    }

    clearTimer(overtimeTimerRef);
    overtimeTimerRef.current = setTimeout(() => {
      armWarning('overtime');
    }, overtimeTimeoutMs(estimatedDurationMin));

    return () => {
      clearTimer(overtimeTimerRef);
    };
  }, [enabled, estimatedDurationMin, showWarning, timerEpoch, armWarning]);

  // Idle timer: arms only while status is idle; clears when Record (or any non-idle) starts.
  useEffect(() => {
    if (!enabled || !isSoloStudioDurationPreset(estimatedDurationMin) || showWarning) {
      clearTimer(idleTimerRef);
      return;
    }

    clearTimer(idleTimerRef);
    if (recordingStatus === 'idle') {
      idleTimerRef.current = setTimeout(() => {
        armWarning('idle');
      }, IDLE_TIMEOUT_MS);
    }

    return () => {
      clearTimer(idleTimerRef);
    };
  }, [enabled, estimatedDurationMin, recordingStatus, showWarning, timerEpoch, armWarning]);

  // Warning countdown → force exit once.
  useEffect(() => {
    if (!showWarning) {
      clearIntervalRef(warningIntervalRef);
      return;
    }

    const startedAt = Date.now();
    setWarningSecondsLeft(Math.ceil(WARNING_COUNTDOWN_MS / 1000));

    warningIntervalRef.current = setInterval(() => {
      const remainingMs = WARNING_COUNTDOWN_MS - (Date.now() - startedAt);
      const secs = Math.max(0, Math.ceil(remainingMs / 1000));
      setWarningSecondsLeft(secs);
      if (remainingMs <= 0) {
        clearIntervalRef(warningIntervalRef);
        if (!forceExitFiredRef.current) {
          forceExitFiredRef.current = true;
          void Promise.resolve(onForceExitRef.current()).catch((e) => {
            const msg =
              e instanceof Error && e.message.trim()
                ? e.message.trim().slice(0, 200)
                : 'force_exit_failed';
            console.error('[useStudioFailsafe] onForceExit', msg);
          });
        }
      }
    }, 250);

    return () => {
      clearIntervalRef(warningIntervalRef);
    };
  }, [showWarning, timerEpoch]);

  return {
    showWarning,
    warningReason,
    warningSecondsLeft,
    acknowledgeWarning,
  };
}
