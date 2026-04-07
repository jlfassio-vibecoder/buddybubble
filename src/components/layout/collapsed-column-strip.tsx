'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared width for any collapsed left column (workspace rail, bubble sidebar, …). */
export const COLLAPSED_COLUMN_WIDTH_CLASS = 'w-8';

/**
 * Expand control for a collapsed column: chevron and vertical label share one centered column axis.
 * The block is bottom-anchored (`justify-end`) within the strip so when strips stack vertically,
 * controls align along the bottom of each flex segment per the layout TDD.
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
  variant?: 'zinc' | 'card' | 'sidebar' | 'black';
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={expandTitle}
      aria-label={expandAriaLabel}
      aria-expanded={false}
      className={cn(
        'flex min-h-0 w-full flex-1 flex-col justify-end overflow-y-auto overflow-x-hidden p-0',
        variant === 'zinc' && 'text-zinc-100 hover:bg-zinc-900/50',
        variant === 'card' && 'text-card-foreground hover:bg-muted/80',
        /** Collapsed strip on `bg-sidebar` (Bubbles rail). */
        variant === 'sidebar' &&
          'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        variant === 'black' && 'text-zinc-100 hover:bg-white/10',
      )}
    >
      {/* Chevron above the vertical label; outer flex justify-end anchors this block to the strip bottom. */}
      <span className="flex min-h-0 shrink-0 flex-col items-center gap-3 px-0 pb-4 pt-2">
        <ChevronRight className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
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
