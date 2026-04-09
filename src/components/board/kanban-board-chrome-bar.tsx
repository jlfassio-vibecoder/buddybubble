'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import { Info, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { kanbanBoardTitleForCategory } from '@/lib/kanban-board-title';
import type { KanbanBoardSegment } from '@/lib/kanban-board-segment';
import type { WorkspaceCategory } from '@/types/database';

const BOARD_SEGMENT_OPTIONS: {
  value: KanbanBoardSegment;
  shortLabel: string;
  fullLabel: string;
}[] = [
  { value: 'planning', shortLabel: 'Pl', fullLabel: 'Planning' },
  { value: 'scheduled', shortLabel: 'Sc', fullLabel: 'Scheduled' },
  { value: 'today', shortLabel: 'Td', fullLabel: 'Today' },
  { value: 'past', shortLabel: 'PE', fullLabel: 'Past events' },
];

const KANBAN_BOARD_HELP =
  'Drag cards between columns to update status. Open a card for the full editor, comments, and attachments.';

export type KanbanBoardChromeBarProps = {
  workspaceName?: string | null;
  categoryType?: WorkspaceCategory | null;
  hasBubble: boolean;
  onToggleBoardStrip?: () => void;
  boardStripCollapsed?: boolean;
  boardSegment: KanbanBoardSegment;
  onBoardSegmentChange: (segment: KanbanBoardSegment) => void;
};

/** Single rail cell: same density as `CalendarRailChromeBar` (unified header row beside calendar). */
export function KanbanBoardChromeBar({
  workspaceName = null,
  categoryType = null,
  hasBubble,
  onToggleBoardStrip,
  boardStripCollapsed = false,
  boardSegment,
  onBoardSegmentChange,
}: KanbanBoardChromeBarProps) {
  const boardTitle = kanbanBoardTitleForCategory(categoryType);
  const nameLine = workspaceName?.trim() ?? '';
  const chromeTitle = nameLine || 'Kanban';
  const chromeTitleAria = [nameLine, boardTitle].filter(Boolean).join('. ') || boardTitle;

  return (
    <div className="flex min-h-0 w-full min-w-0 items-center gap-2 bg-background px-2 py-2">
      {onToggleBoardStrip ? (
        <button
          type="button"
          onClick={onToggleBoardStrip}
          className="max-md:hidden shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={boardStripCollapsed ? 'Expand Kanban columns' : 'Collapse Kanban to left strip'}
          aria-label={
            boardStripCollapsed ? 'Expand Kanban board columns' : 'Collapse Kanban to left strip'
          }
        >
          {boardStripCollapsed ? (
            <PanelLeftOpen className="h-5 w-5" strokeWidth={2} aria-hidden />
          ) : (
            <PanelLeftClose className="h-5 w-5" strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}
      <span
        className="min-w-0 max-w-[min(100%,12rem)] shrink truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:max-w-[min(100%,20rem)]"
        title={chromeTitle}
        aria-label={chromeTitleAria}
      >
        {chromeTitle}
      </span>
      {hasBubble ? (
        <div
          className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
          role="group"
          aria-label="Board column focus"
        >
          {BOARD_SEGMENT_OPTIONS.map(({ value, shortLabel, fullLabel }) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              title={fullLabel}
              className={cn(
                'h-7 min-w-[2.25rem] px-2 text-[10px] font-semibold',
                boardSegment === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label={fullLabel}
              aria-pressed={boardSegment === value}
              onClick={() => onBoardSegmentChange(value)}
            >
              {shortLabel}
            </Button>
          ))}
        </div>
      ) : null}
      <Tooltip.Provider delay={200}>
        <Tooltip.Root>
          <Tooltip.Trigger
            type="button"
            className={cn(
              'shrink-0 rounded p-1 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              !hasBubble ? 'ml-auto' : '',
            )}
            aria-label={KANBAN_BOARD_HELP}
          >
            <Info className="size-4" aria-hidden />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom" sideOffset={6} align="end">
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
  );
}
