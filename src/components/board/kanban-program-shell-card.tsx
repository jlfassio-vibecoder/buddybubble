'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { BubbleRow, TaskRow, WorkspaceCategory } from '@/types/database';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { KanbanTaskCard } from '@/components/board/kanban-task-card';
import type { KanbanCardDensity } from '@/components/board/kanban-density';
import type { OpenTaskOptions } from '@/components/modals/TaskModal';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function readShellMeta(metadata: TaskRow['metadata']): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function shellThemeAccentClass(color: unknown): string | null {
  if (typeof color !== 'string' || !color.trim()) return null;
  const key = color.trim().toLowerCase();
  const map: Record<string, string> = {
    emerald: 'border-l-emerald-500',
    blue: 'border-l-blue-500',
    violet: 'border-l-violet-500',
    amber: 'border-l-amber-500',
    rose: 'border-l-rose-500',
    slate: 'border-l-slate-500',
  };
  return map[key] ?? null;
}

export type KanbanProgramShellCardProps = {
  shellTask: TaskRow;
  childTasks: TaskRow[];
  dragHandle?: ReactNode;
  canWrite: boolean;
  bubbles: BubbleRow[];
  boardColumnDefs: { id: string; label: string }[] | null;
  cardDensity: KanbanCardDensity;
  workspaceCategory: WorkspaceCategory | null;
  calendarTimezone: string;
  commentUnreadByTaskId: Record<string, number>;
  commentLatestUnreadMessageIdByTaskId: Record<string, string | null>;
  onMoveToBubble: (taskId: string, targetBubbleId: string) => void;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  onStartWorkout?: (task: TaskRow) => void;
  bubbleUpPropsFor: (taskId: string) => Omit<TaskBubbleUpControlProps, 'density'> | undefined;
  /** When true (e.g. drag overlay), shell stays compact and expand/collapse is hidden. */
  isDragging?: boolean;
};

export function KanbanProgramShellCard({
  shellTask,
  childTasks,
  dragHandle,
  canWrite,
  bubbles,
  boardColumnDefs,
  cardDensity,
  workspaceCategory,
  calendarTimezone,
  commentUnreadByTaskId,
  commentLatestUnreadMessageIdByTaskId,
  onMoveToBubble,
  onOpenTask,
  onStartWorkout,
  bubbleUpPropsFor,
  isDragging = false,
}: KanbanProgramShellCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const expanded = !isDragging && isExpanded;
  const meta = readShellMeta(shellTask.metadata);
  const themeColor = meta.color;
  const accentClass = shellThemeAccentClass(themeColor);
  const borderStyle =
    typeof themeColor === 'string' && themeColor.trim().startsWith('#')
      ? ({ borderLeftColor: themeColor.trim(), borderLeftWidth: 4 } as const)
      : undefined;

  const totalFromMeta = meta.total_workouts;
  const total =
    typeof totalFromMeta === 'number' && Number.isFinite(totalFromMeta) && totalFromMeta >= 0
      ? Math.round(totalFromMeta)
      : childTasks.length;

  const completed = useMemo(
    () => childTasks.filter((t) => taskColumnIsCompletionStatus(t.status, boardColumnDefs)).length,
    [childTasks, boardColumnDefs],
  );

  const progressPct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-sm ring-1 ring-border/40">
      <Card
        className={cn(
          'border-0 shadow-none ring-0 border-l-4',
          accentClass ?? (!borderStyle ? 'border-l-primary' : 'border-l-transparent'),
        )}
        style={borderStyle ?? undefined}
        size="sm"
      >
        <CardContent className="space-y-2 p-3">
          <div className="flex items-start gap-2">
            {dragHandle ? (
              <div className="shrink-0 pt-0.5 text-muted-foreground [&_button]:-m-0.5 [&_button]:rounded-md [&_button]:p-0.5 [&_button]:hover:bg-muted [&_button]:hover:text-foreground">
                {dragHandle}
              </div>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-snug text-foreground">
                    {shellTask.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {completed} / {total} workouts completed
                  </p>
                </div>
                {!isDragging ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded ? 'Collapse program workouts' : 'Expand program workouts'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded((v) => !v);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4" aria-hidden />
                    )}
                  </Button>
                ) : null}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {expanded ? (
        <div className="space-y-2 border-t border-border/60 bg-muted/20 px-2 py-2">
          {childTasks.length === 0 ? (
            <p className="px-1 py-2 text-center text-xs text-muted-foreground">No workouts yet</p>
          ) : (
            childTasks.map((child) => (
              <KanbanTaskCard
                key={child.id}
                task={child}
                canWrite={canWrite}
                bubbles={bubbles}
                density={cardDensity}
                workspaceCategory={workspaceCategory}
                calendarTimezone={calendarTimezone}
                commentUnreadCount={commentUnreadByTaskId[child.id] ?? 0}
                commentLatestUnreadMessageId={
                  commentLatestUnreadMessageIdByTaskId[child.id] ?? null
                }
                onMoveToBubble={onMoveToBubble}
                onOpenTask={onOpenTask}
                onStartWorkout={onStartWorkout}
                bubbleUp={bubbleUpPropsFor(child.id)}
                isCompleted={taskColumnIsCompletionStatus(child.status, boardColumnDefs)}
                showKanbanCoverToggle
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
