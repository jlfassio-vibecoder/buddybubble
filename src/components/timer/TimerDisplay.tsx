'use client';

import { useEffect, useState } from 'react';
import {
  formatElapsedMs,
  formatSessionTime,
  type SessionTimeFormat,
} from '@/lib/timer/format-session-time';
import { cn } from '@/lib/utils';

export type TimerDisplayProps = {
  getElapsedMs: () => number;
  /** When false, skip the rAF loop (saves work while disconnected). */
  isActive?: boolean;
  className?: string;
  /** Default count-up via formatElapsedMs. */
  format?: SessionTimeFormat;
  /** Required for countdown modes. */
  totalMs?: number;
};

/**
 * High-frequency clock display: keeps `setState` local to this subtree.
 */
export function TimerDisplay({
  getElapsedMs,
  isActive = true,
  className,
  format = 'count-up',
  totalMs,
}: TimerDisplayProps) {
  const [label, setLabel] = useState('00:00.0');

  useEffect(() => {
    if (!isActive) return;

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const elapsed = getElapsedMs();
      const next =
        format === 'count-up'
          ? formatElapsedMs(elapsed)
          : formatSessionTime(elapsed, format, totalMs);
      setLabel((prev) => (prev === next ? prev : next));
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [getElapsedMs, isActive, format, totalMs]);

  return (
    <span
      className={cn('font-mono text-2xl tabular-nums tracking-tight text-foreground', className)}
      aria-live="polite"
    >
      {label}
    </span>
  );
}
