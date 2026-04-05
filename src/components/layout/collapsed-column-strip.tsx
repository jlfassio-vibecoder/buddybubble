'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared width for any collapsed left column (workspace rail, bubble sidebar, …). */
export const COLLAPSED_COLUMN_WIDTH_CLASS = 'w-8';

/**
 * Expand control for a collapsed column: chevron and vertical label share one centered axis,
 * anchored to the bottom so multiple collapsed columns line up across the shell.
 */
export function CollapsedColumnStrip({
  title,
  expandTitle,
  expandAriaLabel,
  onExpand,
  variant = 'zinc',
}: {
  title: string;
  expandTitle: string;
  expandAriaLabel: string;
  onExpand: () => void;
  variant?: 'zinc' | 'card' | 'white' | 'black';
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={expandTitle}
      aria-label={expandAriaLabel}
      aria-expanded={false}
      className={cn(
        'flex min-h-0 w-full flex-1 flex-col justify-start overflow-y-auto overflow-x-hidden p-0',
        variant === 'zinc' && 'text-zinc-100 hover:bg-zinc-900/50',
        variant === 'card' && 'text-foreground hover:bg-muted/80',
        variant === 'white' && 'text-zinc-900 hover:bg-zinc-100/90',
        variant === 'black' && 'text-zinc-100 hover:bg-white/10',
      )}
    >
      {/* Chevron above the vertical label, top-aligned within each stacked segment. */}
      <span className="flex min-h-0 flex-col items-center gap-3 px-0 pb-4 pt-4">
        <ChevronDown className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
        <span
          className={cn(
            'select-none text-center text-[10px] font-semibold uppercase tracking-[0.14em]',
            '[text-orientation:mixed] [writing-mode:vertical-rl] rotate-180',
          )}
        >
          {title}
        </span>
      </span>
    </button>
  );
}
