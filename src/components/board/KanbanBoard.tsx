'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  defaultDropAnimation,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@utils/supabase/client';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import {
  PRIORITY_FILTER_STORAGE_KEY,
  compareTasksByPriorityThenTitle,
  compareTasksByTitle,
  parsePriorityFilter,
  taskMatchesPriorityFilter,
  type PriorityFilter,
} from '@/lib/task-priority';
import {
  DATE_FILTER_STORAGE_KEY,
  DATE_SORT_STORAGE_KEY,
  parseDateFilter,
  parseDateSortMode,
  sortTasksByScheduledOn,
  taskMatchesDateFilter,
  type DateFilter,
  type DateSortMode,
} from '@/lib/task-date-filter';
import { scheduledOnRelativeToWorkspaceToday } from '@/lib/workspace-calendar';
import type { WorkspaceCategory } from '@/types/database';
import type { BubbleRow, TaskRow } from '@/types/database';
import { KanbanBoardHeader } from '@/components/board/kanban-board-header';
import { KanbanColumnHeader } from '@/components/board/kanban-column-header';
import { KanbanColumnAdd } from '@/components/board/kanban-column-add';
import {
  KANBAN_CARD_DENSITY_STORAGE_KEY,
  parseKanbanCardDensity,
  type KanbanCardDensity,
} from '@/components/board/kanban-density';
import { KanbanTaskCard, KanbanTaskCardDragDecoration } from '@/components/board/kanban-task-card';
import type { TaskModalTab } from '@/components/modals/TaskModal';
import { GripVertical } from 'lucide-react';
import { motion } from 'motion/react';

const KANBAN_COLLAPSED_COLUMNS_KEY_PREFIX = 'buddybubble.kanbanCollapsedColumns:';

function makeEmptyColumns(slugs: string[]): Record<string, TaskRow[]> {
  const m: Record<string, TaskRow[]> = {};
  for (const s of slugs) m[s] = [];
  return m;
}

function groupTasksToColumns(tasks: TaskRow[], slugs: string[]): Record<string, TaskRow[]> {
  const map = makeEmptyColumns(slugs);
  const fallback = slugs[0] ?? 'todo';
  for (const t of tasks) {
    const s = slugs.includes(t.status) ? t.status : fallback;
    map[s].push(t);
  }
  for (const slug of slugs) {
    map[slug].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  return map;
}

/** Same rule as cron / TaskModal save: scheduled + date is workspace "today" → column `today`. */
function tasksWithScheduledPromotedToTodayForGrouping(
  tasks: TaskRow[],
  columnSlugs: string[],
  calendarTimezone: string | null | undefined,
): TaskRow[] {
  if (
    !columnSlugs.includes('today') ||
    !columnSlugs.includes('scheduled') ||
    calendarTimezone == null ||
    String(calendarTimezone).trim() === ''
  ) {
    return tasks;
  }
  return tasks.map((t) => {
    if (
      t.status === 'scheduled' &&
      t.scheduled_on &&
      scheduledOnRelativeToWorkspaceToday(t.scheduled_on, calendarTimezone) === 'today'
    ) {
      return { ...t, status: 'today' };
    }
    return t;
  });
}

function alignStatuses(
  cols: Record<string, TaskRow[]>,
  slugs: string[],
): Record<string, TaskRow[]> {
  const next = makeEmptyColumns(slugs);
  for (const s of slugs) {
    next[s] = cols[s].map((t) => ({ ...t, status: s }));
  }
  return next;
}

function findContainerForId(
  id: string,
  cols: Record<string, TaskRow[]>,
  slugs: string[],
): string | undefined {
  if (slugs.includes(id)) return id;
  for (const s of slugs) {
    if (cols[s].some((t) => t.id === id)) return s;
  }
  return undefined;
}

/** Cross-column move (same rules as onDragOver) — used when drag ends before last over event applied. */
function moveBetweenContainers(
  prev: Record<string, TaskRow[]>,
  activeId: string,
  overId: string,
  active: DragOverEvent['active'],
  over: DragOverEvent['over'],
  slugs: string[],
): Record<string, TaskRow[]> {
  const activeContainer = findContainerForId(activeId, prev, slugs);
  const overContainer = findContainerForId(overId, prev, slugs);
  if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

  const activeItems = prev[activeContainer];
  const overItems = prev[overContainer];
  const activeIndex = activeItems.findIndex((t) => t.id === activeId);
  if (activeIndex < 0) return prev;

  const task = activeItems[activeIndex];
  let newIndex: number;
  if (slugs.includes(overId)) {
    newIndex = overItems.length;
  } else {
    const overIndex = overItems.findIndex((t) => t.id === overId);
    const isBelowOver =
      over &&
      over.rect.height > 0 &&
      active.rect.current.translated &&
      active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
    if (overIndex < 0) newIndex = overItems.length;
    else newIndex = overIndex + (isBelowOver ? 1 : 0);
  }

  const moved: TaskRow = { ...task, status: overContainer };
  return {
    ...prev,
    [activeContainer]: prev[activeContainer].filter((t) => t.id !== activeId),
    [overContainer]: [
      ...prev[overContainer].slice(0, newIndex),
      moved,
      ...prev[overContainer].slice(newIndex),
    ],
  };
}

type Props = {
  canWrite: boolean;
  /** Bubbles in this BuddyBubble for moving a task to another Bubble (dropdown on each card). */
  bubbles: BubbleRow[];
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  /** Opens create flow; pass `status` to pre-select the column in the full editor. */
  onOpenCreateTask?: (opts?: { status: string }) => void;
  /** From active workspace — date labels and overdue styling on cards. */
  workspaceCategory?: WorkspaceCategory | null;
  /** Workspace IANA timezone for date filters and relative styling. */
  calendarTimezone?: string | null;
  /** Collapse the board to a strip; parent ensures Messages stays open when needed. */
  onCollapse?: () => void;
};

export function KanbanBoard({
  canWrite,
  bubbles,
  onOpenTask,
  onOpenCreateTask,
  workspaceCategory = null,
  calendarTimezone = null,
  onCollapse,
}: Props) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const columnDefs = useBoardColumnDefs(activeWorkspace?.id ?? null);
  const columnSlugs = useMemo(() => (columnDefs ?? []).map((c) => c.id), [columnDefs]);

  const activeBubble = useWorkspaceStore((s) => s.activeBubble);
  const bubbleId = activeBubble?.id ?? null;

  const [columns, setColumns] = useState<Record<string, TaskRow[]>>({});
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null);
  const [cardDensity, setCardDensity] = useState<KanbanCardDensity>('full');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [dateSortMode, setDateSortMode] = useState<DateSortMode>('none');
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<string>>(() => new Set());
  const draggingRef = useRef(false);
  const columnsSnapshotRef = useRef<Record<string, TaskRow[]> | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const loadTasks = useCallback(async () => {
    if (!bubbleId || columnSlugs.length === 0) {
      setColumns(makeEmptyColumns(columnSlugs.length ? columnSlugs : ['todo']));
      return;
    }
    const supabase = createClient();
    const isAll = bubbleId === ALL_BUBBLES_BUBBLE_ID;
    const ids = bubbles.map((b) => b.id);
    if (isAll && ids.length === 0) {
      setColumns(makeEmptyColumns(columnSlugs));
      return;
    }
    let query = supabase.from('tasks').select('*').order('position', { ascending: true });
    if (isAll) {
      query = query.in('bubble_id', ids);
    } else {
      query = query.eq('bubble_id', bubbleId);
    }
    const { data } = await query;
    if (draggingRef.current) return;
    const rows = (data ?? []) as TaskRow[];

    const tz = calendarTimezone?.trim() || null;
    const canPromote =
      columnSlugs.includes('today') && columnSlugs.includes('scheduled') && tz != null && tz !== '';

    let toGroup = rows;
    if (canPromote) {
      const promoteIds = rows
        .filter(
          (t) =>
            t.status === 'scheduled' &&
            t.scheduled_on &&
            scheduledOnRelativeToWorkspaceToday(t.scheduled_on, tz) === 'today',
        )
        .map((t) => t.id);

      if (promoteIds.length > 0) {
        if (canWrite) {
          const { error } = await supabase
            .from('tasks')
            .update({ status: 'today' })
            .in('id', promoteIds);
          if (!error) {
            const idSet = new Set(promoteIds);
            toGroup = rows.map((t) => (idSet.has(t.id) ? { ...t, status: 'today' as const } : t));
          } else {
            console.error('[KanbanBoard] scheduled→today promotion on load failed', error);
            toGroup = tasksWithScheduledPromotedToTodayForGrouping(rows, columnSlugs, tz);
          }
        } else {
          toGroup = tasksWithScheduledPromotedToTodayForGrouping(rows, columnSlugs, tz);
        }
      }
    }

    setColumns(groupTasksToColumns(toGroup, columnSlugs));
  }, [bubbleId, bubbles, columnSlugs, calendarTimezone, canWrite]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    setCardDensity(parseKanbanCardDensity(localStorage.getItem(KANBAN_CARD_DENSITY_STORAGE_KEY)));
    setPriorityFilter(parsePriorityFilter(localStorage.getItem(PRIORITY_FILTER_STORAGE_KEY)));
    setDateFilter(parseDateFilter(localStorage.getItem(DATE_FILTER_STORAGE_KEY)));
    setDateSortMode(parseDateSortMode(localStorage.getItem(DATE_SORT_STORAGE_KEY)));
  }, []);

  const workspaceId = activeWorkspace?.id ?? null;

  useEffect(() => {
    if (!workspaceId || typeof window === 'undefined') {
      setCollapsedColumnIds(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`${KANBAN_COLLAPSED_COLUMNS_KEY_PREFIX}${workspaceId}`);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      setCollapsedColumnIds(
        new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []),
      );
    } catch {
      setCollapsedColumnIds(new Set());
    }
  }, [workspaceId]);

  const handleCardDensityChange = useCallback((d: KanbanCardDensity) => {
    setCardDensity(d);
    localStorage.setItem(KANBAN_CARD_DENSITY_STORAGE_KEY, d);
  }, []);

  const handlePriorityFilterChange = useCallback((f: PriorityFilter) => {
    setPriorityFilter(f);
    localStorage.setItem(PRIORITY_FILTER_STORAGE_KEY, f);
  }, []);

  const handleDateFilterChange = useCallback((f: DateFilter) => {
    setDateFilter(f);
    localStorage.setItem(DATE_FILTER_STORAGE_KEY, f);
  }, []);

  const handleDateSortModeChange = useCallback((m: DateSortMode) => {
    setDateSortMode(m);
    localStorage.setItem(DATE_SORT_STORAGE_KEY, m);
  }, []);

  const tz = calendarTimezone?.trim() || activeWorkspace?.calendar_timezone || 'UTC';

  const visibleColumns = useMemo(() => {
    const next: Record<string, TaskRow[]> = {};
    for (const s of columnSlugs) {
      let list = [...(columns[s] ?? [])];
      if (priorityFilter !== 'all') {
        list = list.filter((t) => taskMatchesPriorityFilter(t, priorityFilter));
      }
      if (dateFilter !== 'all') {
        list = list.filter((t) => taskMatchesDateFilter(t, dateFilter, tz));
      }
      if (dateSortMode !== 'none') {
        list = sortTasksByScheduledOn(list, dateSortMode);
      }
      next[s] = list;
    }
    return next;
  }, [columns, columnSlugs, priorityFilter, dateFilter, dateSortMode, tz]);

  // Disable manual reorder when column order is computed (date sort), so drag state matches visible order.
  const dragSortDisabled =
    priorityFilter !== 'all' || dateFilter !== 'all' || dateSortMode !== 'none';

  const toggleColumnCollapse = useCallback(
    (columnId: string) => {
      setCollapsedColumnIds((prev) => {
        const next = new Set(prev);
        if (next.has(columnId)) next.delete(columnId);
        else next.add(columnId);
        if (workspaceId && typeof window !== 'undefined') {
          localStorage.setItem(
            `${KANBAN_COLLAPSED_COLUMNS_KEY_PREFIX}${workspaceId}`,
            JSON.stringify([...next]),
          );
        }
        return next;
      });
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!bubbleId) return;
    const isAll = bubbleId === ALL_BUBBLES_BUBBLE_ID;
    const ids = bubbles.map((b) => b.id);
    if (isAll && ids.length === 0) return;

    const supabase = createClient();
    const channelName = isAll
      ? `tasks-board-all:${ids.slice().sort().join(',')}`
      : `tasks-board:${bubbleId}`;
    const channel = supabase.channel(channelName);
    if (isAll) {
      for (const bid of ids) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          () => {
            void loadTasks();
          },
        );
      }
    } else {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        () => {
          void loadTasks();
        },
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bubbleId, bubbles, loadTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const persistColumns = useCallback(
    async (next: Record<string, TaskRow[]>) => {
      if (!bubbleId || !canWrite || columnSlugs.length === 0) return;
      const aligned = alignStatuses(next, columnSlugs);
      const flat = columnSlugs.flatMap((s) => aligned[s]);
      const supabase = createClient();
      const results = await Promise.all(
        flat.map((t, i) =>
          supabase.from('tasks').update({ position: i, status: t.status }).eq('id', t.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error('[KanbanBoard] task update failed', failed.error);
        void loadTasks();
        return;
      }
      void loadTasks();
    },
    [bubbleId, canWrite, columnSlugs, loadTasks],
  );

  const sortColumnBy = useCallback(
    (columnId: string, mode: 'priority' | 'title') => {
      if (!canWrite) return;
      setColumns((prev) => {
        const list = [...(prev[columnId] ?? [])];
        if (list.length < 2) return prev;
        const sorted =
          mode === 'priority'
            ? [...list].sort(compareTasksByPriorityThenTitle)
            : [...list].sort(compareTasksByTitle);
        const next = { ...prev, [columnId]: sorted };
        void persistColumns(next);
        return next;
      });
    },
    [canWrite, persistColumns],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      draggingRef.current = true;
      columnsSnapshotRef.current = columnsRef.current;
      const id = String(event.active.id);
      const col = findContainerForId(id, columnsRef.current, columnSlugs);
      const task = col ? columnsRef.current[col].find((t) => t.id === id) : undefined;
      setActiveTask(task ?? null);
    },
    [columnSlugs],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      setColumns((prev) =>
        moveBetweenContainers(prev, activeId, overId, active, over, columnSlugs),
      );
    },
    [columnSlugs],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over) {
        if (columnsSnapshotRef.current) setColumns(columnsSnapshotRef.current);
        columnsSnapshotRef.current = null;
        draggingRef.current = false;
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);

      let current = columnsRef.current;

      let activeContainer = findContainerForId(activeId, current, columnSlugs);
      let overContainer = findContainerForId(overId, current, columnSlugs);
      if (activeContainer && overContainer && activeContainer !== overContainer) {
        current = moveBetweenContainers(current, activeId, overId, active, over, columnSlugs);
      }

      activeContainer = findContainerForId(activeId, current, columnSlugs);
      overContainer = findContainerForId(overId, current, columnSlugs);
      if (!activeContainer || !overContainer) {
        columnsSnapshotRef.current = null;
        draggingRef.current = false;
        return;
      }

      let next = current;

      if (activeContainer === overContainer) {
        const items = [...current[activeContainer]];
        const activeIndex = items.findIndex((t) => t.id === activeId);
        let overIndex = items.findIndex((t) => t.id === overId);
        if (columnSlugs.includes(overId)) {
          overIndex = Math.max(0, items.length - 1);
        }
        if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
          const reordered = arrayMove(items, activeIndex, overIndex).map((t) => ({
            ...t,
            status: activeContainer!,
          }));
          next = { ...current, [activeContainer]: reordered };
        }
      }

      setColumns(next);
      void persistColumns(next);
      columnsSnapshotRef.current = null;
      draggingRef.current = false;
    },
    [columnSlugs, persistColumns],
  );

  const handleDragCancel = useCallback(() => {
    draggingRef.current = false;
    setActiveTask(null);
    if (columnsSnapshotRef.current) setColumns(columnsSnapshotRef.current);
    columnsSnapshotRef.current = null;
  }, []);

  async function moveTaskToBubble(taskId: string, targetBubbleId: string) {
    if (!canWrite || !bubbleId) return;
    if (bubbleId !== ALL_BUBBLES_BUBBLE_ID && targetBubbleId === bubbleId) return;
    const supabase = createClient();
    const { data: existing } = await supabase
      .from('tasks')
      .select('position')
      .eq('bubble_id', targetBubbleId)
      .order('position', { ascending: false })
      .limit(1);
    const maxPos =
      existing && existing.length > 0
        ? Number((existing[0] as { position: number }).position) + 1
        : 0;
    const { error } = await supabase
      .from('tasks')
      .update({ bubble_id: targetBubbleId, position: maxPos })
      .eq('id', taskId);
    if (!error) void loadTasks();
  }

  const boardReady = columnDefs !== null && columnSlugs.length > 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/30">
      <KanbanBoardHeader
        canWrite={canWrite}
        hasBubble={Boolean(bubbleId)}
        onCollapse={onCollapse}
        cardDensity={cardDensity}
        onCardDensityChange={handleCardDensityChange}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={handlePriorityFilterChange}
        dateFilter={dateFilter}
        onDateFilterChange={handleDateFilterChange}
        dateSortMode={dateSortMode}
        onDateSortModeChange={handleDateSortModeChange}
        onOpenFullEditor={onOpenCreateTask ? () => onOpenCreateTask() : undefined}
      />
      {!bubbleId ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Select a bubble to view tasks
        </div>
      ) : !boardReady ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          Loading board…
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain">
              <div className="flex h-full min-h-0 gap-3 p-3">
                {columnDefs!.map((col, columnIndex) => {
                  const fullTaskCount = (columns[col.id] ?? []).length;
                  const addNew =
                    canWrite && onOpenCreateTask
                      ? () => onOpenCreateTask({ status: col.id })
                      : undefined;
                  return (
                    <motion.div
                      key={col.id}
                      className="flex h-full shrink-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                        delay: Math.min(columnIndex * 0.04, 0.24),
                      }}
                    >
                      <KanbanColumn
                        column={col}
                        tasks={visibleColumns[col.id] ?? []}
                        fullTaskCount={fullTaskCount}
                        collapsed={collapsedColumnIds.has(col.id)}
                        canWrite={canWrite}
                        dragDisabled={dragSortDisabled}
                        bubbles={bubbles}
                        boardReady={boardReady}
                        cardDensity={cardDensity}
                        workspaceCategory={workspaceCategory}
                        calendarTimezone={tz}
                        onMoveToBubble={moveTaskToBubble}
                        onOpenTask={onOpenTask}
                        onAddNew={addNew}
                        onSortByPriority={
                          canWrite ? () => sortColumnBy(col.id, 'priority') : undefined
                        }
                        onSortByTitle={canWrite ? () => sortColumnBy(col.id, 'title') : undefined}
                        onToggleCollapse={() => toggleColumnCollapse(col.id)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
          <DragOverlay
            dropAnimation={{
              ...defaultDropAnimation,
              duration: 280,
              easing: 'cubic-bezier(0.2, 0.82, 0.22, 1)',
            }}
          >
            {activeTask ? (
              <div className="w-64 cursor-grabbing opacity-95">
                <KanbanTaskCard
                  task={activeTask}
                  canWrite={false}
                  bubbles={[]}
                  onMoveToBubble={() => {}}
                  density={cardDensity}
                  workspaceCategory={workspaceCategory}
                  calendarTimezone={tz}
                  className="pointer-events-none shadow-lg"
                  dragHandle={<KanbanTaskCardDragDecoration />}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

type ColumnProps = {
  column: { id: string; label: string };
  tasks: TaskRow[];
  /** Tasks in this column before priority filter (for sort + menu). */
  fullTaskCount: number;
  collapsed: boolean;
  canWrite: boolean;
  /** When true, cards are not draggable (e.g. priority filter is not "all"). */
  dragDisabled: boolean;
  boardReady: boolean;
  bubbles: BubbleRow[];
  cardDensity: KanbanCardDensity;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string;
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  onAddNew?: () => void;
  onSortByPriority?: () => void;
  onSortByTitle?: () => void;
  onToggleCollapse: () => void;
};

function KanbanColumn({
  column,
  tasks,
  fullTaskCount,
  collapsed,
  canWrite,
  dragDisabled,
  boardReady,
  bubbles,
  cardDensity,
  workspaceCategory,
  calendarTimezone,
  onMoveToBubble,
  onOpenTask,
  onAddNew,
  onSortByPriority,
  onSortByTitle,
  onToggleCollapse,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const ids = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const addDisabled = !boardReady || !onAddNew;

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border border-border/80 bg-card p-2 shadow-sm transition-[box-shadow] duration-200 ease-out hover:shadow-md ${
        collapsed ? 'h-auto min-h-[4.5rem] self-start' : 'h-full min-h-[200px]'
      }`}
    >
      <KanbanColumnHeader
        label={column.label}
        count={tasks.length}
        fullTaskCount={fullTaskCount}
        collapsed={collapsed}
        canAddTask={Boolean(onAddNew) && !addDisabled}
        onAddTask={onAddNew}
        onSortByPriority={onSortByPriority}
        onSortByTitle={onSortByTitle}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5">
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="pr-1.5">
              {tasks.length === 0 ? (
                onAddNew ? (
                  <KanbanColumnAdd
                    variant="empty"
                    disabled={addDisabled}
                    onAdd={onAddNew}
                    className="mb-1"
                  />
                ) : (
                  <p className="py-6 text-center text-xs text-muted-foreground">No tasks</p>
                )
              ) : (
                <>
                  {tasks.map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      canWrite={canWrite}
                      dragDisabled={dragDisabled}
                      bubbles={bubbles}
                      cardDensity={cardDensity}
                      workspaceCategory={workspaceCategory}
                      calendarTimezone={calendarTimezone}
                      onMoveToBubble={onMoveToBubble}
                      onOpenTask={onOpenTask}
                    />
                  ))}
                  {onAddNew ? (
                    <KanbanColumnAdd
                      variant="inline"
                      disabled={addDisabled}
                      onAdd={onAddNew}
                      className="mb-1"
                    />
                  ) : null}
                </>
              )}
            </div>
          </SortableContext>
        </div>
      ) : (
        <p className="px-1 pb-1 text-center text-[10px] text-muted-foreground">Column collapsed</p>
      )}
    </div>
  );
}

type CardProps = {
  task: TaskRow;
  canWrite: boolean;
  dragDisabled: boolean;
  bubbles: BubbleRow[];
  cardDensity: KanbanCardDensity;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string;
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
};

function SortableTaskCard({
  task,
  canWrite,
  dragDisabled,
  bubbles,
  cardDensity,
  workspaceCategory,
  calendarTimezone,
  onMoveToBubble,
  onOpenTask,
}: CardProps) {
  const sortableDisabled = !canWrite || dragDisabled;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: sortableDisabled,
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const draggable = canWrite && !dragDisabled;
  const showDecorativeGrip = !draggable && canWrite && dragDisabled;

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <KanbanTaskCard
        task={task}
        canWrite={canWrite}
        bubbles={bubbles}
        density={cardDensity}
        workspaceCategory={workspaceCategory}
        calendarTimezone={calendarTimezone}
        onMoveToBubble={onMoveToBubble}
        onOpenTask={onOpenTask}
        dragHandle={
          draggable ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              className="cursor-grab touch-none active:cursor-grabbing"
              aria-label="Drag to reorder task"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-4" />
            </button>
          ) : showDecorativeGrip ? (
            <KanbanTaskCardDragDecoration />
          ) : null
        }
      />
    </div>
  );
}
