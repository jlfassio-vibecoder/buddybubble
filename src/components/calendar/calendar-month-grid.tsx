'use client';

import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  normalizeItemType,
  type BubbleRow,
  type TaskRow,
  type WorkspaceCategory,
} from '@/types/database';
import type { OpenTaskOptions } from '@/components/modals/TaskModal';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import { KanbanTaskCard } from '@/components/board/kanban-task-card';
import { getItemTypeVisual } from '@/lib/item-type-styles';
import { Button } from '@/components/ui/button';
import { CALENDAR_WEEK_OPTIONS } from '@/lib/calendar-view-range';
import { calendarDayDropId } from '@/lib/calendar-dnd';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BoardColumnDefLite } from '@/components/calendar/calendar-week-ribbon';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function MonthDayDropCell({
  ymd,
  inMonth,
  isToday,
  isSelected,
  onSelectYmd,
  childrenHeader,
  childrenBody,
}: {
  ymd: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onSelectYmd: (ymd: string) => void;
  childrenHeader: React.ReactNode;
  childrenBody: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: calendarDayDropId(ymd) });
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={`Calendar day ${ymd}`}
      onClick={() => onSelectYmd(ymd)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectYmd(ymd);
        }
      }}
      className={cn(
        'flex min-h-[5.5rem] flex-col items-stretch bg-card p-1 text-left transition-colors hover:bg-muted/40',
        'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        !inMonth && 'bg-muted/25 text-muted-foreground',
        isToday && 'ring-1 ring-inset ring-primary/45',
        isSelected && 'ring-2 ring-inset ring-primary',
        isOver && 'bg-primary/10',
      )}
    >
      {childrenHeader}
      {childrenBody}
    </div>
  );
}

export type CalendarMonthGridProps = {
  activeViewDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectYmd: (ymd: string) => void;
  tasksByYmd: Map<string, TaskRow[]>;
  /** Full calendar task list for experience start-day badges. */
  calendarTasks: TaskRow[];
  bubbles: BubbleRow[];
  canWrite: boolean;
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string | null;
  boardColumnDefs: BoardColumnDefLite[] | null;
  todayYmd: string;
  /**
   * Per-day workout volume indicators. Keys are YMD strings (YYYY-MM-DD),
   * values are the number of completed workout sessions on that day.
   * When provided, a row of colored dots is shown under the date number.
   */
  dayAnnotations?: Map<string, number>;
  bubbleUpPropsFor?: (taskId: string) => TaskBubbleUpControlProps | undefined;
};

export function CalendarMonthGrid({
  activeViewDate,
  onPrevMonth,
  onNextMonth,
  onSelectYmd,
  tasksByYmd,
  calendarTasks,
  bubbles,
  canWrite,
  onMoveToBubble,
  onOpenTask,
  workspaceCategory,
  calendarTimezone,
  boardColumnDefs,
  todayYmd,
  dayAnnotations,
  bubbleUpPropsFor,
}: CalendarMonthGridProps) {
  const tz = calendarTimezone?.trim() || 'UTC';
  const activeWorkspaceYmd = getCalendarDateInTimeZone(tz, activeViewDate);
  const visibleMonthKey = activeWorkspaceYmd.slice(0, 7);
  const expVisual = getItemTypeVisual('experience');
  const ExpIcon = expVisual.Icon;

  /** One pass over `calendarTasks` — avoid O(days × tasks) by filtering inside `cells.map`. */
  const experiencesByStartYmd = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of calendarTasks) {
      if (t.archived_at) continue;
      if (normalizeItemType(t.item_type) !== 'experience') continue;
      if (!t.scheduled_on) continue;
      const key = String(t.scheduled_on).slice(0, 10);
      const list = m.get(key) ?? [];
      list.push(t);
      m.set(key, list);
    }
    return m;
  }, [calendarTasks]);

  const monthStart = startOfMonth(activeViewDate);
  const monthEnd = endOfMonth(activeViewDate);
  const gridStart = startOfWeek(monthStart, CALENDAR_WEEK_OPTIONS);
  const gridEnd = endOfWeek(monthEnd, CALENDAR_WEEK_OPTIONS);
  const cells = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="h-full min-h-0 bg-background">
      <div className="border-b border-border bg-muted/15 p-2">
        <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold text-lg leading-tight tracking-tight text-foreground">
            {format(activeViewDate, 'MMMM yyyy')}
          </h3>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onPrevMonth}
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onNextMonth}
              title="Next month"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-px text-center">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px rounded-md border border-border bg-border">
          {cells.map((day) => {
            const ymd = getCalendarDateInTimeZone(tz, day);
            const inMonth = ymd.slice(0, 7) === visibleMonthKey;
            const dayTasks = (tasksByYmd.get(ymd) ?? []).filter(
              (t) => normalizeItemType(t.item_type) !== 'experience',
            );
            const experiencesStartingHere = experiencesByStartYmd.get(ymd) ?? [];
            const isToday = ymd === todayYmd;
            const isSelected = ymd === activeWorkspaceYmd;

            return (
              <MonthDayDropCell
                key={`${ymd}-${day.getTime()}`}
                ymd={ymd}
                inMonth={inMonth}
                isToday={isToday}
                isSelected={isSelected}
                onSelectYmd={onSelectYmd}
                childrenHeader={
                  <>
                    <span
                      className={cn(
                        'mb-0.5 px-0.5 text-left text-[11px] font-semibold tabular-nums text-foreground',
                        isToday && 'text-primary',
                      )}
                    >
                      {Number(ymd.slice(8, 10))}
                    </span>
                    {dayAnnotations && (dayAnnotations.get(ymd) ?? 0) > 0 ? (
                      <div className="flex gap-px px-0.5 pb-0.5" aria-hidden>
                        {Array.from({ length: Math.min(dayAnnotations.get(ymd)!, 5) }, (_, i) => (
                          <span
                            key={i}
                            className="inline-block size-1.5 rounded-full bg-primary/70"
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                }
                childrenBody={
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                    {experiencesStartingHere.map((task) => (
                      <div
                        key={`exp-${task.id}`}
                        role="presentation"
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0"
                      >
                        <button
                          type="button"
                          disabled={!onOpenTask}
                          onClick={() => onOpenTask?.(task.id)}
                          className={cn(
                            'flex w-full min-w-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold leading-tight transition-opacity',
                            expVisual.typeChip,
                            onOpenTask && 'hover:opacity-90',
                            !onOpenTask && 'cursor-default opacity-90',
                          )}
                          title={task.title}
                        >
                          <ExpIcon className="size-2.5 shrink-0 text-current" aria-hidden />
                          <span className="truncate">Experience</span>
                        </button>
                      </div>
                    ))}
                    {dayTasks.map((task) => (
                      <div
                        key={task.id}
                        role="presentation"
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0"
                      >
                        <KanbanTaskCard
                          task={task}
                          canWrite={canWrite}
                          bubbles={bubbles}
                          onMoveToBubble={onMoveToBubble}
                          onOpenTask={onOpenTask}
                          density="micro"
                          workspaceCategory={workspaceCategory}
                          calendarTimezone={calendarTimezone}
                          isCompleted={taskColumnIsCompletionStatus(task.status, boardColumnDefs)}
                          className="shadow-none"
                          bubbleUp={bubbleUpPropsFor?.(task.id)}
                        />
                      </div>
                    ))}
                  </div>
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
