'use client';

import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared width for any collapsed column strip (left or right edge). */
export const COLLAPSED_COLUMN_WIDTH_CLASS = 'w-8';

export type CollapsedColumnStripEdge = 'left' | 'right';

const verticalTitleClass =
  'select-none text-center text-[10px] font-semibold uppercase tracking-[0.14em] [text-orientation:mixed] [writing-mode:vertical-rl] rotate-180';

/**
 * Expand control for a collapsed column strip: panel “open” icon + vertical label on one axis.
 * Default **bottom** (`verticalAlign="bottom"`): anchored with `justify-end` so stacked strips align per layout TDD.
 * **Top** (`verticalAlign="top"`): icon + label from the top — used for Kanban / Programs collapsed columns.
 */
export function CollapsedColumnStrip({
  title,
  expandTitle,
  expandAriaLabel,
  onExpand,
  edge,
  variant = 'zinc',
  verticalAlign = 'bottom',
  count,
}: {
  title: string;
  expandTitle: string;
  expandAriaLabel: string;
  onExpand: () => void;
  edge: CollapsedColumnStripEdge;
  variant?: 'zinc' | 'card' | 'sidebar' | 'black';
  /** Default `bottom` preserves legacy rail behavior. */
  verticalAlign?: 'top' | 'bottom';
  /** Optional badge (e.g. visible task count) below the vertical title when `verticalAlign` is `top`. */
  count?: number;
}) {
  const ExpandIcon = edge === 'left' ? PanelLeftOpen : PanelRightOpen;
  const isTop = verticalAlign === 'top';

  return (
    <button
      type="button"
      onClick={onExpand}
      title={expandTitle}
      aria-label={expandAriaLabel}
      aria-expanded={false}
      className={cn(
        'flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden p-0',
        isTop ? 'justify-start' : 'justify-end',
        variant === 'zinc' && 'text-zinc-100 hover:bg-zinc-900/50',
        variant === 'card' && 'text-card-foreground hover:bg-muted/80',
        /** Collapsed strip on `bg-sidebar` (Bubbles rail). */
        variant === 'sidebar' &&
          'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        variant === 'black' && 'text-zinc-100 hover:bg-white/10',
      )}
    >
      <span
        className={cn(
          'flex min-h-0 shrink-0 flex-col items-center gap-3 px-0',
          isTop ? 'justify-start pt-2 pb-2' : 'pb-4 pt-2',
        )}
      >
        <ExpandIcon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        <span className={verticalTitleClass}>{title}</span>
        {isTop && count != null && count > 0 ? (
          <span
            className="rounded-full border border-[color:color-mix(in_srgb,var(--accent-yellow)_35%,transparent)] bg-[var(--accent-yellow-bg)] px-1 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--accent-yellow-text)]"
            aria-hidden
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </span>
    </button>
  );
}
