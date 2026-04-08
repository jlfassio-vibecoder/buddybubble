'use client';

import { useDroppable } from '@dnd-kit/core';
import { addDays, eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns';
import type { BubbleRow, TaskRow, WorkspaceCategory } from '@/types/database';
import type { TaskModalTab } from '@/components/modals/TaskModal';
import { KanbanTaskCard } from '@/components/board/kanban-task-card';
import { CALENDAR_WEEK_OPTIONS } from '@/lib/calendar-view-range';
import { calendarDayDropId } from '@/lib/calendar-dnd';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { cn } from '@/lib/utils';

export type BoardColumnDefLite = { id: string; label: string };

export type CalendarRibbonMode = '1' | '3' | '7';

function WeekDayDropColumn({
  ymd,
  className,
  children,
}: {
  ymd: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: calendarDayDropId(ymd) });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'ring-2 ring-primary/55 ring-offset-0')}
    >
      {children}
    </div>
  );
}

export type CalendarWeekRibbonProps = {
  activeViewDate: Date;
  /** How many day columns the ribbon shows and how they share horizontal space. */
  ribbonMode: CalendarRibbonMode;
  tasksByYmd: Map<string, TaskRow[]>;
  bubbles: BubbleRow[];
  canWrite: boolean;
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  boardColumnDefs: BoardColumnDefLite[] | null;
  /** Workspace-local today (YYYY-MM-DD). */
  todayYmd: string;
};

export function CalendarWeekRibbon({
  activeViewDate,
  ribbonMode,
  tasksByYmd,
  bubbles,
  canWrite,
  onMoveToBubble,
  onOpenTask,
  workspaceCategory,
  calendarTimezone,
  boardColumnDefs,
  todayYmd,
}: CalendarWeekRibbonProps) {
  const tz = calendarTimezone?.trim() || 'UTC';
  const activeWorkspaceYmd = getCalendarDateInTimeZone(tz, activeViewDate);

  let days: Date[];
  if (ribbonMode === '1') {
    days = [activeViewDate];
  } else if (ribbonMode === '3') {
    days = [0, 1, 2].map((i) => addDays(activeViewDate, i));
  } else {
    const weekStart = startOfWeek(activeViewDate, CALENDAR_WEEK_OPTIONS);
    const weekEnd = endOfWeek(activeViewDate, CALENDAR_WEEK_OPTIONS);
    days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  }

  const renderDayColumn = (day: Date) => {
    const ymd = getCalendarDateInTimeZone(tz, day);
    const dayTasks = tasksByYmd.get(ymd) ?? [];
    const isToday = ymd === todayYmd;
    const isActive = ymd === activeWorkspaceYmd;
    const fixedWeekWidth = ribbonMode === '7';

    return (
      <WeekDayDropColumn
        key={`${ymd}-${day.getTime()}`}
        ymd={ymd}
        className={cn(
          'flex min-h-0 flex-col rounded-md border border-border bg-card',
          fixedWeekWidth ? 'w-[10.5rem] shrink-0' : 'min-w-0',
          isToday && 'ring-1 ring-primary/35',
          isActive && !isToday && 'ring-1 ring-ring/40',
        )}
      >
        <div className="shrink-0 border-b border-border bg-card px-2 py-1.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {format(day, 'EEE')}
          </p>
          <p
            className={cn(
              'text-sm font-semibold tabular-nums text-foreground',
              isToday && 'text-primary',
            )}
          >
            {format(day, 'MMM d')}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {dayTasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              canWrite={canWrite}
              bubbles={bubbles}
              onMoveToBubble={onMoveToBubble}
              onOpenTask={onOpenTask}
              density="full"
              workspaceCategory={workspaceCategory}
              calendarTimezone={calendarTimezone}
              isCompleted={taskColumnIsCompletionStatus(task.status, boardColumnDefs)}
            />
          ))}
        </div>
      </WeekDayDropColumn>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {ribbonMode === '7' ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-w-max gap-2 px-2 py-2">{days.map(renderDayColumn)}</div>
        </div>
      ) : (
        <div
          className={cn(
            'grid min-h-0 min-w-0 flex-1 gap-2 px-2 py-2',
            ribbonMode === '1' && 'grid-cols-1',
            ribbonMode === '3' && 'grid-cols-3',
          )}
        >
          {days.map(renderDayColumn)}
        </div>
      )}
    </div>
  );
}
