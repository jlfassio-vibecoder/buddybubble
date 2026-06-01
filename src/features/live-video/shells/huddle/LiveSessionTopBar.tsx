'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type LiveSessionTopBarProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function LiveSessionTopBar({ left, center, right, className }: LiveSessionTopBarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col justify-between gap-4 border-b border-border pb-3 sm:flex-row sm:items-center',
        className,
      )}
    >
      {left != null ? <div className="min-w-0">{left}</div> : null}
      {center != null ? (
        <div className="hidden min-w-0 shrink-0 justify-center sm:flex">{center}</div>
      ) : null}
      {right != null ? (
        <div className="flex min-w-0 w-full justify-end sm:w-auto">{right}</div>
      ) : null}
    </div>
  );
}
