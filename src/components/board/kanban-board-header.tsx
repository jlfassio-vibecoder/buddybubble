'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import { Info, Maximize2, PanelLeftClose, Shrink, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { KanbanCardDensity } from '@/components/board/kanban-density';
import type { PriorityFilter } from '@/lib/task-priority';
import type { DateFilter, DateSortMode } from '@/lib/task-date-filter';

const DENSITY_OPTIONS: {
  value: KanbanCardDensity;
  label: string;
  Icon: typeof Shrink;
}[] = [
  { value: 'summary', label: 'Summary', Icon: Shrink },
  { value: 'full', label: 'Full', Icon: Square },
  { value: 'detailed', label: 'Detailed', Icon: Maximize2 },
];

const PRIORITY_FILTER_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'has_date', label: 'Has date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due ≤7d' },
];

const DATE_SORT_OPTIONS: { value: DateSortMode; label: string }[] = [
  { value: 'none', label: 'Manual order' },
  { value: 'asc', label: 'Date ↑' },
  { value: 'desc', label: 'Date ↓' },
];

const KANBAN_BOARD_HELP =
  'Drag cards between columns to update status. Open a card for the full editor, comments, and attachments.';

export type KanbanBoardHeaderProps = {
  canWrite: boolean;
  hasBubble: boolean;
  /** Collapse the board to a strip (opens Messages if needed). */
  onCollapse?: () => void;
  onOpenFullEditor?: () => void;
  cardDensity: KanbanCardDensity;
  onCardDensityChange: (density: KanbanCardDensity) => void;
  priorityFilter: PriorityFilter;
  onPriorityFilterChange: (filter: PriorityFilter) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
  dateSortMode: DateSortMode;
  onDateSortModeChange: (mode: DateSortMode) => void;
};

export function KanbanBoardHeader({
  canWrite,
  hasBubble,
  onCollapse,
  onOpenFullEditor,
  cardDensity,
  onCardDensityChange,
  priorityFilter,
  onPriorityFilterChange,
  dateFilter,
  onDateFilterChange,
  dateSortMode,
  onDateSortModeChange,
}: KanbanBoardHeaderProps) {
  const pillGroupClass =
    'inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/50 p-0.5';

  return (
    <div className="shrink-0 border-b border-border bg-background px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div className="min-w-0 shrink-0 lg:max-w-[min(100%,28rem)]">
          <div className="flex items-center gap-1.5">
            {onCollapse ? (
              <button
                type="button"
                onClick={onCollapse}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Collapse Kanban"
                aria-label="Collapse Kanban panel"
              >
                <PanelLeftClose className="size-5" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            <h2 className="text-base font-semibold tracking-tight text-foreground">Kanban Board</h2>
            <Tooltip.Provider delay={200}>
              <Tooltip.Root>
                <Tooltip.Trigger
                  type="button"
                  className={cn(
                    'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground',
                    'outline-none transition-colors hover:bg-muted hover:text-foreground',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                  aria-label={KANBAN_BOARD_HELP}
                >
                  <Info className="size-4" aria-hidden />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner side="bottom" sideOffset={6} align="start">
                    <Tooltip.Popup
                      className={cn(
                        'z-[200] max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-xs leading-snug text-popover-foreground shadow-md',
                      )}
                    >
                      {KANBAN_BOARD_HELP}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-2',
            'lg:flex-row lg:flex-wrap lg:items-center lg:justify-end lg:gap-x-2 lg:gap-y-2',
          )}
          role="toolbar"
          aria-label="Board filters and view options"
        >
          <div className={pillGroupClass} role="group" aria-label="Filter by scheduled or due date">
            {DATE_FILTER_OPTIONS.map(({ value, label }) => {
              const active = dateFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onDateFilterChange(value)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            className={pillGroupClass}
            role="group"
            aria-label="Sort by scheduled date within columns"
          >
            {DATE_SORT_OPTIONS.map(({ value, label }) => {
              const active = dateSortMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onDateSortModeChange(value)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className={pillGroupClass} role="group" aria-label="Filter by priority">
            {PRIORITY_FILTER_OPTIONS.map(({ value, label }) => {
              const active = priorityFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onPriorityFilterChange(value)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            className={cn(
              'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center',
              'lg:inline-flex lg:max-w-full lg:flex-row lg:gap-2',
            )}
          >
            <div
              className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/50 p-0.5"
              role="group"
              aria-label="Card detail level"
            >
              {DENSITY_OPTIONS.map(({ value, label, Icon }) => {
                const active = cardDensity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onCardDensityChange(value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-90" aria-hidden />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            {canWrite && hasBubble && onOpenFullEditor && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full shrink-0 sm:w-auto"
                onClick={onOpenFullEditor}
              >
                Full editor
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
