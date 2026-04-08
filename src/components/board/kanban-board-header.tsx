'use client';

import { Circle, Maximize2, Shrink, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { KanbanCardDensity } from '@/components/board/kanban-density';
import type { PriorityFilter } from '@/lib/task-priority';
import type { DateFilter, DateSortMode } from '@/lib/task-date-filter';
import { kanbanBoardTitleForCategory } from '@/lib/kanban-board-title';
import type { WorkspaceCategory } from '@/types/database';

const DENSITY_OPTIONS: {
  value: KanbanCardDensity;
  label: string;
  Icon: typeof Shrink;
}[] = [
  /** Calendar month cells use `micro`; users may persist it from there — keep in sync with toolbar. */
  { value: 'micro', label: 'Micro', Icon: Circle },
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

export type KanbanBoardHeaderProps = {
  categoryType?: WorkspaceCategory | null;
  canWrite: boolean;
  hasBubble: boolean;
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

/** Filter / density toolbar only (chrome row is `KanbanBoardChromeBar` beside `CalendarRailChromeBar`). */
export function KanbanBoardHeader({
  categoryType = null,
  canWrite,
  hasBubble,
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
  const boardTitle = kanbanBoardTitleForCategory(categoryType);

  const pillGroupClass =
    'inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/50 p-0.5';

  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 flex-col gap-2 border-b border-border bg-background px-2 py-2',
        'lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-2 lg:gap-y-2',
      )}
      role="toolbar"
      aria-label="Board filters and view options"
    >
      <p className="w-full shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground lg:w-auto">
        {boardTitle}
      </p>
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
  );
}
