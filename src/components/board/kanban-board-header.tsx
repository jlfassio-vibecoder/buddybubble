'use client';

import {
  Archive,
  ChevronDown,
  ChevronUp,
  Circle,
  Maximize2,
  Search,
  Shrink,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  { value: 'desc', label: 'Date ↓' },
  { value: 'asc', label: 'Date ↑' },
];

export type KanbanBoardHeaderProps = {
  categoryType?: WorkspaceCategory | null;
  canWrite: boolean;
  hasBubble: boolean;
  onOpenFullEditor?: () => void;
  onOpenArchive?: () => void;
  cardDensity: KanbanCardDensity;
  onCardDensityChange: (density: KanbanCardDensity) => void;
  priorityFilter: PriorityFilter;
  onPriorityFilterChange: (filter: PriorityFilter) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (filter: DateFilter) => void;
  dateSortMode: DateSortMode;
  onDateSortModeChange: (mode: DateSortMode) => void;
  textFilter: string;
  onTextFilterChange: (query: string) => void;
  /** When set, the filter rows can collapse to a single bar; persist state in the parent. */
  filtersCollapsed?: boolean;
  onToggleFiltersCollapsed?: () => void;
};

/** Filter / density toolbar only (chrome row is `KanbanBoardChromeBar` beside `CalendarRailChromeBar`). */
export function KanbanBoardHeader({
  categoryType = null,
  canWrite,
  hasBubble,
  onOpenFullEditor,
  onOpenArchive,
  cardDensity,
  onCardDensityChange,
  priorityFilter,
  onPriorityFilterChange,
  dateFilter,
  onDateFilterChange,
  dateSortMode,
  onDateSortModeChange,
  textFilter,
  onTextFilterChange,
  filtersCollapsed = false,
  onToggleFiltersCollapsed,
}: KanbanBoardHeaderProps) {
  const boardTitle = kanbanBoardTitleForCategory(categoryType);
  const collapseEnabled = Boolean(onToggleFiltersCollapsed);
  const textFilterTrimmed = textFilter.trim();

  const pillGroupClass =
    'inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/50 p-0.5';

  const titleClass =
    'shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';

  const textFilterControl = (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id="kanban-text-filter"
        type="search"
        value={textFilter}
        onChange={(e) => onTextFilterChange(e.target.value)}
        placeholder="Search title or focus…"
        className="h-8 pr-8 pl-7"
        aria-label="Filter by name or focus"
      />
      {textFilterTrimmed.length > 0 && (
        <button
          type="button"
          className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onTextFilterChange('')}
          aria-label="Clear name or focus filter"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );

  const filtersBody = (
    <>
      <div className="flex min-w-0 flex-col gap-1 sm:min-w-[12rem] sm:max-w-xs sm:flex-1 lg:flex-none">
        <label htmlFor="kanban-text-filter" className={titleClass}>
          Filter by name or focus
        </label>
        {textFilterControl}
      </div>

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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {onOpenArchive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              onClick={onOpenArchive}
              aria-label="View Archive"
            >
              <Archive className="mr-2 size-4" aria-hidden />
              Archive
            </Button>
          )}
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
    </>
  );

  if (collapseEnabled && filtersCollapsed) {
    return (
      <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-1.5">
        <p className={titleClass}>{boardTitle}</p>
        {textFilterControl}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onToggleFiltersCollapsed}
          aria-expanded={false}
          aria-label="Show board filters"
        >
          <ChevronDown className="size-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
        </Button>
      </div>
    );
  }

  if (collapseEnabled && !filtersCollapsed) {
    return (
      <div
        className="flex min-w-0 shrink-0 flex-col border-b border-border bg-background"
        role="toolbar"
        aria-label="Board filters and view options"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
          <p className={cn(titleClass, 'min-w-0')}>{boardTitle}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
            onClick={onToggleFiltersCollapsed}
            aria-expanded
            aria-label="Hide board filters"
          >
            <ChevronUp className="size-4 shrink-0" aria-hidden />
          </Button>
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-col gap-2 px-2 py-2',
            'lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-2 lg:gap-y-2',
          )}
        >
          {filtersBody}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-w-0 shrink-0 flex-col gap-2 border-b border-border bg-background px-2 py-2',
        'lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-2 lg:gap-y-2',
      )}
      role="toolbar"
      aria-label="Board filters and view options"
    >
      <p className={cn('w-full shrink-0', titleClass, 'lg:w-auto')}>{boardTitle}</p>
      {filtersBody}
    </div>
  );
}
