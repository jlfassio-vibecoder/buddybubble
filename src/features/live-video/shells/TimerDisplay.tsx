'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type TimerDisplayProps = {
  getElapsedMs: () => number;
  /** When false, skip the rAF loop (saves work while Realtime is disconnected). */
  isActive?: boolean;
  className?: string;
};

/** Formats elapsed ms as `MM:SS.T` (tenths). */
export function formatElapsedMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalTenths = Math.floor(clamped / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const sec = totalSeconds % 60;
  const min = Math.floor(totalSeconds / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
}

/**
 * High-frequency clock display: keeps `setState` local to this subtree.
 * Parent `BaseVideoHarness` does not re-render on each tick (only this component does).
 */
export function TimerDisplay({ getElapsedMs, isActive = true, className }: TimerDisplayProps) {
  const [label, setLabel] = useState('00:00.0');

  useEffect(() => {
    if (!isActive) return;

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const next = formatElapsedMs(getElapsedMs());
      setLabel((prev) => (prev === next ? prev : next));
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [getElapsedMs, isActive]);

  return (
    <span
      className={cn('font-mono text-2xl tabular-nums tracking-tight text-foreground', className)}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
