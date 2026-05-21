'use client';

import { useEffect, useRef, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'idle' | 'requesting' | 'held' | 'released' | 'error';

type WakeLockSentinel = { release: () => Promise<void> };

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
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const requestedRef = useRef(requested);
  requestedRef.current = requested;

  useEffect(() => {
    if (!isSupported) return;

    const releaseHeld = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel) return;
      try {
        await sentinel.release();
        setStatus('released');
      } catch {
        setStatus('error');
      }
    };

    const acquire = async () => {
      if (!requestedRef.current) return;
      if (sentinelRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      setStatus('requesting');
      try {
        const sentinel = await wakeLockApi!.request('screen');
        if (!requestedRef.current) {
          try {
            await sentinel.release();
          } catch {
            // Browser may already have released the lock (e.g. visibility hidden).
          }
          setStatus('released');
          return;
        }
        sentinelRef.current = sentinel;
        setStatus('held');
      } catch {
        sentinelRef.current = null;
        setStatus('error');
      }
    };

    const acquireSafe = () => {
      void acquire().catch(() => {
        sentinelRef.current = null;
        setStatus('error');
      });
    };

    if (requested) {
      acquireSafe();
    } else {
      void releaseHeld();
      setStatus('idle');
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void releaseHeld();
        return;
      }
      if (document.visibilityState === 'visible' && requestedRef.current) {
        acquireSafe();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void releaseHeld();
    };
  }, [requested, isSupported, wakeLockApi]);

  return { status, isSupported };
}
