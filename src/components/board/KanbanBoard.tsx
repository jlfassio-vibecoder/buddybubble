'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
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
import { ALL_BUBBLES_BUBBLE_ID, defaultBubbleIdForWrites } from '@/lib/all-bubbles';
import type { BubbleRow, TaskRow } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
  onOpenTask?: (taskId: string) => void;
  onOpenCreateTask?: () => void;
};

export function KanbanBoard({ canWrite, bubbles, onOpenTask, onOpenCreateTask }: Props) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const columnDefs = useBoardColumnDefs(activeWorkspace?.id ?? null);
  const columnSlugs = useMemo(() => (columnDefs ?? []).map((c) => c.id), [columnDefs]);

  const activeBubble = useWorkspaceStore((s) => s.activeBubble);
  const bubbleId = activeBubble?.id ?? null;

  const [columns, setColumns] = useState<Record<string, TaskRow[]>>({});
  const [activeTask, setActiveTask] = useState<TaskRow | null>(null);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const draggingRef = useRef(false);
  const columnsSnapshotRef = useRef<Record<string, TaskRow[]> | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const firstColumnSlug = columnSlugs[0] ?? 'todo';

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
    setColumns(groupTasksToColumns((data ?? []) as TaskRow[], columnSlugs));
  }, [bubbleId, bubbles, columnSlugs]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

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

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const targetBubbleId =
      bubbleId === ALL_BUBBLES_BUBBLE_ID ? defaultBubbleIdForWrites(bubbles) : bubbleId;
    if (!targetBubbleId || !title.trim() || !canWrite) return;
    setAdding(true);
    const supabase = createClient();
    const flat = columnSlugs.flatMap((s) => columnsRef.current[s] ?? []);
    const maxPos = flat.length > 0 ? Math.max(...flat.map((t) => t.position ?? 0)) + 1 : 0;
    const { error } = await supabase.from('tasks').insert({
      bubble_id: targetBubbleId,
      title: title.trim(),
      status: firstColumnSlug,
      position: maxPos,
    });
    setAdding(false);
    if (!error) {
      setTitle('');
      void loadTasks();
    }
  }

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
    <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
      <div className="flex items-start justify-between gap-2 border-b border-border bg-background px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="text-xs text-muted-foreground">
            Drag between columns for status. Use the card control to move a task to another bubble.
          </p>
        </div>
        {canWrite && bubbleId && onOpenCreateTask && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenCreateTask}>
            Full editor
          </Button>
        )}
      </div>
      {canWrite && bubbleId && (
        <form onSubmit={addTask} className="flex gap-2 border-b border-border bg-background p-3">
          <Input
            placeholder="New task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" disabled={adding || !title.trim() || !boardReady}>
            Add
          </Button>
        </form>
      )}
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
          <div
            className="grid min-h-0 flex-1 gap-2 p-3"
            style={{
              gridTemplateColumns: `repeat(${columnDefs!.length}, minmax(0, 1fr))`,
            }}
          >
            {columnDefs!.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={columns[col.id] ?? []}
                canWrite={canWrite}
                bubbles={bubbles}
                onMoveToBubble={moveTaskToBubble}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <Card className="mb-2 w-60 cursor-grabbing opacity-90 shadow-lg">
                <CardContent className="space-y-2 p-3 text-sm">
                  <p className="font-medium">{activeTask.title}</p>
                  {activeTask.description && (
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {activeTask.description}
                    </p>
                  )}
                </CardContent>
              </Card>
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
  canWrite: boolean;
  bubbles: BubbleRow[];
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string) => void;
};

function KanbanColumn({
  column,
  tasks,
  canWrite,
  bubbles,
  onMoveToBubble,
  onOpenTask,
}: ColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const ids = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-[200px] flex-col rounded-lg border border-border bg-card p-2"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{column.label}</h3>
      <div className="min-h-0 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="pr-3">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                canWrite={canWrite}
                bubbles={bubbles}
                onMoveToBubble={onMoveToBubble}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

type CardProps = {
  task: TaskRow;
  canWrite: boolean;
  bubbles: BubbleRow[];
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string) => void;
};

function SortableTaskCard({ task, canWrite, bubbles, onMoveToBubble, onOpenTask }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-2 ${canWrite ? 'cursor-grab touch-none' : ''}`}
      {...(canWrite ? { ...attributes, ...listeners } : {})}
    >
      <Card className="border-border">
        <CardContent className="space-y-2 p-3 text-sm">
          <p className="font-medium">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-3">{task.description}</p>
          )}
          {onOpenTask && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpenTask(task.id)}
            >
              Open details
            </button>
          )}
          {canWrite && bubbles.length > 0 && (
            <div className="space-y-1">
              <label className="block text-[10px] font-medium uppercase text-muted-foreground">
                Bubble
              </label>
              <select
                value={task.bubble_id}
                onChange={(e) => void onMoveToBubble(task.id, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                {bubbles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
