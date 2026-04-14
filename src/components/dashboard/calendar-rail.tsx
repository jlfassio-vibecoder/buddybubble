'use client';

import { addMonths, parseISO, startOfMonth, subMonths } from 'date-fns';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Calendar, GripHorizontal, PanelRightClose, PanelRightOpen } from 'lucide-react';
import {
  normalizeItemType,
  type BubbleRow,
  type MemberRole,
  type TaskRow,
  type WorkspaceCategory,
} from '@/types/database';
import type { TaskModalTab } from '@/components/modals/TaskModal';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';
import { calendarDataRangeYmd } from '@/lib/calendar-view-range';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { useCalendarTasks } from '@/hooks/use-calendar-tasks';
import {
  CalendarWeekRibbon,
  type CalendarRibbonMode,
} from '@/components/calendar/calendar-week-ribbon';
import { CalendarMonthGrid } from '@/components/calendar/calendar-month-grid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COLLAPSED_COLUMN_WIDTH_CLASS } from '@/components/layout/collapsed-column-strip';

const CALENDAR_VERTICAL_SPLIT_STORAGE_KEY = 'buddybubble.calendar.vertical_split';

function clampRibbonFraction(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0.08, Math.min(0.92, n));
}

/** `{ ribbonFraction }` or legacy panel percentage map from older layouts. */
function parseStoredRibbonFraction(raw: string | null): number | undefined {
  if (raw == null || raw === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.ribbonFraction === 'number' && Number.isFinite(rec.ribbonFraction)) {
      return clampRibbonFraction(rec.ribbonFraction);
    }
    const r = rec['calendar-ribbon'];
    const m = rec['calendar-month'];
    if (typeof r === 'number' && typeof m === 'number' && r + m > 0) {
      return clampRibbonFraction(r / (r + m));
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function persistRibbonFraction(frac: number) {
  try {
    localStorage.setItem(
      CALENDAR_VERTICAL_SPLIT_STORAGE_KEY,
      JSON.stringify({ ribbonFraction: clampRibbonFraction(frac) }),
    );
  } catch {
    /* ignore */
  }
}

function workspaceTodayAnchorDate(calendarTimezone: string | null): Date {
  const tz = calendarTimezone?.trim() ? calendarTimezone : 'UTC';
  const ymd = getCalendarDateInTimeZone(tz);
  return parseISO(`${ymd}T12:00:00`);
}

function tasksByScheduledYmd(tasks: TaskRow[]): Map<string, TaskRow[]> {
  const m = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const ymd = t.scheduled_on ? String(t.scheduled_on).slice(0, 10) : '';
    if (!ymd) continue;
    const list = m.get(ymd) ?? [];
    list.push(t);
    m.set(ymd, list);
  }
  return m;
}

export type CalendarRailContextProps = {
  workspaceId: string;
  bubbles: BubbleRow[];
  activeBubbleId: string | null;
  canWrite: boolean;
  calendarTimezone: string | null;
  workspaceCategory: WorkspaceCategory | null;
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  workspaceMemberRole?: MemberRole | null;
  guestTaskUserId?: string | null;
};

export type CalendarRailChromeBarProps = {
  loading: boolean;
  error: string | null;
  ribbonMode: CalendarRibbonMode;
  onRibbonModeChange: (mode: CalendarRibbonMode) => void;
  onCollapse: () => void;
  /** Same as showing 1D/3D/7D toggles in `CalendarRail`. */
  showRibbonToggles: boolean;
  /** Shown before the "Calendar" label (split header + collapsed strip). */
  buddyBubbleTitle?: string;
};

/** Top chrome row (matches Kanban split header when embedded beside the board). */
export function CalendarRailChromeBar({
  loading,
  error,
  ribbonMode,
  onRibbonModeChange,
  onCollapse,
  showRibbonToggles,
  buddyBubbleTitle,
}: CalendarRailChromeBarProps) {
  return (
    <div className="flex min-h-0 w-full min-w-0 items-center gap-2 bg-background px-2 py-2">
      {buddyBubbleTitle ? (
        <span
          className="min-w-0 max-w-[min(40%,12rem)] shrink truncate text-xs font-semibold text-foreground"
          title={buddyBubbleTitle}
        >
          {buddyBubbleTitle}
        </span>
      ) : null}
      {buddyBubbleTitle ? (
        <span className="shrink-0 text-muted-foreground/50" aria-hidden>
          ·
        </span>
      ) : null}
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Calendar
      </span>
      {loading ? <span className="text-[10px] text-muted-foreground">Loading…</span> : null}
      {error ? (
        <span className="min-w-0 flex-1 truncate text-[10px] text-destructive" title={error}>
          {error}
        </span>
      ) : null}
      {showRibbonToggles ? (
        <div
          className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
          role="group"
          aria-label="Ribbon day range"
        >
          {(
            [
              { mode: '1' as const, label: '1D' },
              { mode: '3' as const, label: '3D' },
              { mode: '7' as const, label: '7D' },
            ] as const
          ).map(({ mode, label }) => (
            <Button
              key={mode}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 min-w-[2.25rem] px-2 text-[10px] font-semibold',
                ribbonMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={ribbonMode === mode}
              onClick={() => onRibbonModeChange(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onCollapse}
        className={cn(
          'max-md:hidden shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground',
          showRibbonToggles ? '' : 'ml-auto',
        )}
        title="Collapse Calendar"
        aria-label="Collapse Calendar panel"
      >
        <PanelRightClose className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

export type CalendarRailProps = {
  isCollapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  /** Bumped by parent after archive or calendar drop so lists refetch. */
  reloadNonce?: number;
  /**
   * Kanban is hidden: calendar shares the main stage with Messages only — grow to fill the right
   * pane instead of `max-w-[50%]` beside the board.
   */
  mainStage?: boolean;
  /**
   * Parent already sizes the column (e.g. `SplitKanbanCalendarStage` grid). Omit `max-w-[50%]`, which
   * is relative to that cell and would only fill half the column, leaving empty space.
   */
  fillHostColumn?: boolean;
  /** Parent renders `CalendarRailChromeBar` inline; body only here. */
  omitChrome?: boolean;
  /** Controlled ribbon mode when `omitChrome` (e.g. `KanbanBoard` unified header row). */
  ribbonMode?: CalendarRibbonMode;
  onRibbonModeChange?: (mode: CalendarRibbonMode) => void;
  /** Loading / error for an external chrome bar. */
  onFetchState?: (state: { loading: boolean; error: string | null }) => void;
  buddyBubbleTitle?: string;
} & CalendarRailContextProps;

export type { CalendarRibbonMode };

export function CalendarRail({
  isCollapsed,
  onExpand,
  onCollapse,
  workspaceId,
  bubbles,
  activeBubbleId,
  canWrite,
  calendarTimezone,
  workspaceCategory,
  onOpenTask,
  workspaceMemberRole = null,
  guestTaskUserId = null,
  reloadNonce = 0,
  mainStage = false,
  fillHostColumn = false,
  omitChrome = false,
  ribbonMode: ribbonModeProp,
  onRibbonModeChange: onRibbonModeChangeProp,
  onFetchState,
  buddyBubbleTitle,
}: CalendarRailProps) {
  const boardColumnDefs = useBoardColumnDefs(workspaceId);

  const [activeViewDate, setActiveViewDate] = useState(() =>
    workspaceTodayAnchorDate(calendarTimezone),
  );
  const [internalRibbonMode, setInternalRibbonMode] = useState<CalendarRibbonMode>('7');
  const ribbonMode = ribbonModeProp ?? internalRibbonMode;
  const setRibbonMode = onRibbonModeChangeProp ?? setInternalRibbonMode;

  useEffect(() => {
    setActiveViewDate(workspaceTodayAnchorDate(calendarTimezone));
  }, [workspaceId, calendarTimezone]);

  const bubbleIds = useMemo(() => {
    if (!activeBubbleId || bubbles.length === 0) return [];
    if (activeBubbleId === ALL_BUBBLES_BUBBLE_ID) return bubbles.map((b) => b.id);
    return [activeBubbleId];
  }, [activeBubbleId, bubbles]);

  const tzResolved = calendarTimezone?.trim() ? calendarTimezone : 'UTC';

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => calendarDataRangeYmd(activeViewDate, tzResolved),
    [activeViewDate, tzResolved],
  );

  const fetchEnabled = !isCollapsed && bubbleIds.length > 0;

  const { tasks, loading, error } = useCalendarTasks({
    workspaceId,
    bubbleIds,
    rangeStart,
    rangeEnd,
    enabled: fetchEnabled,
    reloadNonce,
    workspaceMemberRole,
    guestTaskUserId,
  });

  useEffect(() => {
    onFetchState?.({ loading, error: error ?? null });
  }, [loading, error, onFetchState]);

  const tasksByYmd = useMemo(() => tasksByScheduledYmd(tasks), [tasks]);

  /**
   * Per-day workout session counts for the volume overlay on the month grid.
   * Only computed for fitness workspaces; undefined otherwise (no dots rendered).
   */
  const dayAnnotations = useMemo((): Map<string, number> | undefined => {
    if (workspaceCategory !== 'fitness') return undefined;
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.archived_at) continue;
      if (t.status !== 'completed') continue;
      const type = normalizeItemType(t.item_type);
      if (type !== 'workout' && type !== 'workout_log') continue;
      if (!t.scheduled_on) continue;
      const key = String(t.scheduled_on).slice(0, 10);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [tasks, workspaceCategory]);

  /** Tick so "today" updates when the tab stays open across days or after backgrounding. */
  const [todayTick, bumpToday] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') bumpToday();
    };
    document.addEventListener('visibilitychange', onVisible);
    const hourly = window.setInterval(bumpToday, 3_600_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(hourly);
    };
  }, []);

  const todayYmd = useMemo(() => getCalendarDateInTimeZone(tzResolved), [tzResolved, todayTick]);

  const noopMoveToBubble = useCallback((_taskId: string, _targetBubbleId: string) => {}, []);

  const handleSelectYmdFromMonthGrid = useCallback(
    (ymd: string) => {
      setActiveViewDate(parseISO(`${ymd}T12:00:00`));
      setRibbonMode('1');
    },
    [setRibbonMode],
  );

  const handlePrevMonth = useCallback(() => {
    setActiveViewDate((d) => startOfMonth(subMonths(d, 1)));
  }, []);

  const handleNextMonth = useCallback(() => {
    setActiveViewDate((d) => startOfMonth(addMonths(d, 1)));
  }, []);

  const [ribbonFraction, setRibbonFraction] = useState(0.5);
  const ribbonFractionRef = useRef(ribbonFraction);
  useEffect(() => {
    ribbonFractionRef.current = ribbonFraction;
  }, [ribbonFraction]);

  useEffect(() => {
    const stored = parseStoredRibbonFraction(
      typeof window !== 'undefined'
        ? localStorage.getItem(CALENDAR_VERTICAL_SPLIT_STORAGE_KEY)
        : null,
    );
    if (stored != null) setRibbonFraction(stored);
  }, []);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [splitDragging, setSplitDragging] = useState(false);

  const onSplitDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;
    setSplitDragging(true);
  }, []);

  useEffect(() => {
    if (!splitDragging) return;
    const container = splitContainerRef.current;
    if (!container) {
      setSplitDragging(false);
      return;
    }

    const onMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const h = rect.height;
      if (h <= 1) return;
      const y = ev.clientY - rect.top;
      setRibbonFraction(clampRibbonFraction(y / h));
    };

    const end = () => {
      setSplitDragging(false);
      persistRibbonFraction(ribbonFractionRef.current);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [splitDragging]);

  useEffect(() => {
    if (!splitDragging) return;
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    return () => {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [splitDragging]);

  if (isCollapsed) {
    return (
      <div
        className={cn(
          'max-md:hidden flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-muted/30',
          COLLAPSED_COLUMN_WIDTH_CLASS,
        )}
      >
        <button
          type="button"
          onClick={onExpand}
          title="Expand Calendar"
          aria-label="Expand Calendar panel"
          aria-expanded={false}
          className="flex min-h-0 w-full flex-1 flex-col justify-end overflow-y-auto overflow-x-hidden p-0 text-muted-foreground hover:bg-muted/80"
        >
          <span className="flex min-h-0 shrink-0 flex-col items-center gap-3 px-0 pb-4 pt-2">
            <PanelRightOpen className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            <Calendar className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            {buddyBubbleTitle ? (
              <span
                className={cn(
                  'line-clamp-4 max-h-24 min-h-0 max-w-[2.75rem] select-none break-all text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.1em] text-muted-foreground',
                  '[text-orientation:mixed] [writing-mode:vertical-rl] rotate-180',
                )}
                title={buddyBubbleTitle}
              >
                {buddyBubbleTitle}
              </span>
            ) : null}
            <span
              className={cn(
                'select-none text-center text-[10px] font-semibold uppercase tracking-[0.14em]',
                '[text-orientation:mixed] [writing-mode:vertical-rl] rotate-180',
              )}
            >
              Calendar
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background',
        mainStage
          ? 'min-w-0 flex-1'
          : fillHostColumn
            ? 'min-h-0 min-w-0 w-full max-w-none'
            : 'min-w-[16rem] max-w-[50%] shrink-0',
      )}
    >
      {omitChrome ? null : (
        <div className="shrink-0 border-b border-border">
          <CalendarRailChromeBar
            loading={loading}
            error={error}
            ribbonMode={ribbonMode}
            onRibbonModeChange={setRibbonMode}
            onCollapse={onCollapse}
            showRibbonToggles={Boolean(activeBubbleId && bubbles.length > 0)}
            buddyBubbleTitle={buddyBubbleTitle}
          />
        </div>
      )}

      {!activeBubbleId || bubbles.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Select a bubble to view the calendar.
        </div>
      ) : (
        <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ flex: `${ribbonFraction} 1 0%` }}
          >
            <div className="h-full min-h-0 overflow-y-auto">
              <CalendarWeekRibbon
                activeViewDate={activeViewDate}
                ribbonMode={ribbonMode}
                tasksByYmd={tasksByYmd}
                bubbles={bubbles}
                canWrite={canWrite}
                onMoveToBubble={noopMoveToBubble}
                onOpenTask={onOpenTask}
                workspaceCategory={workspaceCategory}
                calendarTimezone={calendarTimezone}
                boardColumnDefs={boardColumnDefs}
                todayYmd={todayYmd}
              />
            </div>
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize week ribbon and month view"
            title="Drag to resize ribbon and month"
            className={cn(
              'relative z-[1] flex min-h-[44px] shrink-0 cursor-row-resize touch-none select-none items-center justify-center',
              'border-y border-border bg-border py-1.5 transition-colors hover:bg-accent',
              splitDragging && 'bg-accent',
            )}
            onPointerDown={onSplitDividerPointerDown}
          >
            <span className="pointer-events-none rounded-sm border border-border bg-muted/80 px-1">
              <GripHorizontal className="size-3.5 text-muted-foreground" aria-hidden />
            </span>
          </div>
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ flex: `${1 - ribbonFraction} 1 0%` }}
          >
            <div className="h-full min-h-0 overflow-y-auto">
              <CalendarMonthGrid
                activeViewDate={activeViewDate}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onSelectYmd={handleSelectYmdFromMonthGrid}
                tasksByYmd={tasksByYmd}
                calendarTasks={tasks}
                bubbles={bubbles}
                canWrite={canWrite}
                onMoveToBubble={noopMoveToBubble}
                onOpenTask={onOpenTask}
                workspaceCategory={workspaceCategory}
                calendarTimezone={calendarTimezone}
                boardColumnDefs={boardColumnDefs}
                todayYmd={todayYmd}
                dayAnnotations={dayAnnotations}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
