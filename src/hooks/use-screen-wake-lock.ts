'use client';

import { useEffect, useRef, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'idle' | 'requesting' | 'held' | 'released' | 'error';

type ScreenWakeLockSentinel = WakeLockSentinel;

function getWakeLockApi(): WakeLock | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.wakeLock;
}

export function useScreenWakeLock(requested: boolean): {
  status: WakeLockStatus;
  isSupported: boolean;
} {
  const wakeLockApi = getWakeLockApi();
  const isSupported = wakeLockApi != null;
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    isSupported ? 'idle' : 'unsupported',
  );
  const sentinelRef = useRef<ScreenWakeLockSentinel | null>(null);
  const requestedRef = useRef(requested);
  requestedRef.current = requested;

  useEffect(() => {
    if (!isSupported) return;

    let cancelled = false;
    const safeSetStatus = (next: WakeLockStatus) => {
      if (!cancelled) setStatus(next);
    };

    const releaseHeld = async (options?: { updateStatus?: boolean }) => {
      const updateStatus = options?.updateStatus ?? true;
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel) return;
      try {
        await sentinel.release();
        if (updateStatus) safeSetStatus('released');
      } catch {
        if (updateStatus) safeSetStatus('error');
      }
    };

    const acquire = async () => {
      if (!requestedRef.current) return;
      if (sentinelRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      safeSetStatus('requesting');
      try {
        const sentinel: ScreenWakeLockSentinel = await wakeLockApi!.request('screen');

        const onSentinelReleased = () => {
          if (sentinelRef.current !== sentinel) return;
          sentinelRef.current = null;
          safeSetStatus('idle');
          if (requestedRef.current && document.visibilityState === 'visible') {
            acquireSafe();
          }
        };

        if (typeof sentinel.addEventListener === 'function') {
          sentinel.addEventListener('release', onSentinelReleased);
        }

        if (!requestedRef.current) {
          if (typeof sentinel.removeEventListener === 'function') {
            sentinel.removeEventListener('release', onSentinelReleased);
          }
          try {
            await sentinel.release();
          } catch {
            // Browser may already have released the lock (e.g. visibility hidden).
          }
          safeSetStatus('released');
          return;
        }

        sentinelRef.current = sentinel;
        safeSetStatus('held');
      } catch {
        sentinelRef.current = null;
        safeSetStatus('error');
      }
    };

    const acquireSafe = () => {
      void acquire().catch(() => {
        sentinelRef.current = null;
        safeSetStatus('error');
      });
    };

    if (requested) {
      acquireSafe();
    } else {
      void releaseHeld({ updateStatus: false });
      safeSetStatus('idle');
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void releaseHeld({ updateStatus: false });
        return;
      }
      if (document.visibilityState === 'visible' && requestedRef.current) {
        acquireSafe();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void releaseHeld({ updateStatus: false });
    };
  }, [requested, isSupported, wakeLockApi]);

  return { status, isSupported };
}
