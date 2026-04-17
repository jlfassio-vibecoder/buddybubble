'use client';

import type { LucideIcon } from 'lucide-react';
import { normalizeItemType, type TaskRow } from '@/types/database';
import { getItemTypeVisual, itemTypeUiNoun, type ItemTypeVisual } from '@/lib/item-type-styles';
import { cn } from '@/lib/utils';
import type { OpenTaskOptions } from '@/types/open-task-options';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';
import { CardTabStrip } from '@/components/tasks/card-tab-strip';
import { taskCardCoverPath, useTaskCardCoverUrl } from '@/lib/task-card-cover';

export type ChatFeedTaskCardProps = {
  task: TaskRow | null;
  /** Opens TaskModal; optional `tab` matches the board card tab strip. */
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  bubbleUp?: Omit<TaskBubbleUpControlProps, 'density'>;
};

function ChatFeedCardHeader({
  task,
  visual,
  typeLabel,
  Icon,
}: {
  task: TaskRow;
  visual: ItemTypeVisual;
  typeLabel: string;
  Icon: LucideIcon;
}) {
  const coverPath = taskCardCoverPath(task);
  const { url: coverUrl, loading } = useTaskCardCoverUrl(coverPath);

  if (!coverPath) {
    return (
      <>
        <div
          className={cn(
            'flex items-center gap-2 border-b border-stone-100/90 px-3 py-2 dark:border-border/60',
            visual.surface,
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', visual.iconText)} aria-hidden />
          <span className={cn('text-xs font-semibold', visual.iconText)}>{typeLabel}</span>
        </div>
        <div className="px-3 py-2.5 text-left">
          <p className="font-semibold text-stone-900 dark:text-foreground">{task.title}</p>
          {task.description?.trim() ? (
            <p className="mt-1 line-clamp-2 text-sm text-stone-500 dark:text-muted-foreground">
              {task.description}
            </p>
          ) : null}
        </div>
      </>
    );
  }

  if (!loading && !coverUrl) {
    return (
      <>
        <div
          className={cn(
            'flex items-center gap-2 border-b border-stone-100/90 px-3 py-2 dark:border-border/60',
            visual.surface,
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', visual.iconText)} aria-hidden />
          <span className={cn('text-xs font-semibold', visual.iconText)}>{typeLabel}</span>
        </div>
        <div className="px-3 py-2.5 text-left">
          <p className="font-semibold text-stone-900 dark:text-foreground">{task.title}</p>
          {task.description?.trim() ? (
            <p className="mt-1 line-clamp-2 text-sm text-stone-500 dark:text-muted-foreground">
              {task.description}
            </p>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div className="relative min-h-[132px] overflow-hidden">
      {loading && !coverUrl ? (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      ) : coverUrl ? (
        <>
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/42 to-black/68"
            aria-hidden
          />
        </>
      ) : null}
      <div className="relative z-10 space-y-2 px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-white drop-shadow" aria-hidden />
          <span className="text-xs font-semibold text-white drop-shadow">{typeLabel}</span>
        </div>
        <p className="font-semibold text-white drop-shadow [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
          {task.title}
        </p>
        {task.description?.trim() ? (
          <p className="line-clamp-2 text-sm text-white/90 drop-shadow [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
            {task.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Read-only Kanban card preview for the Messages rail (“tweet” embed).
 */
export function ChatFeedTaskCard({ task, onOpenTask, bubbleUp }: ChatFeedTaskCardProps) {
  if (!task) {
    return null;
  }

  const itemType = normalizeItemType(task.item_type);
  const visual = getItemTypeVisual(itemType);
  const Icon = visual.Icon;
  const noun = itemTypeUiNoun(itemType);
  const typeLabel = noun.charAt(0).toUpperCase() + noun.slice(1);

  const openDefault = () => onOpenTask?.(task.id);

  return (
    <div
      className={cn(
        'w-full max-w-sm mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-all',
        'dark:border-border dark:bg-card',
      )}
    >
      <div
        role={onOpenTask ? 'button' : undefined}
        tabIndex={onOpenTask ? 0 : undefined}
        onClick={onOpenTask ? openDefault : undefined}
        onKeyDown={(e) => {
          if (!onOpenTask) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDefault();
          }
        }}
        className={cn(
          'w-full text-left',
          onOpenTask && 'cursor-pointer hover:shadow-md dark:hover:shadow-md',
        )}
      >
        <ChatFeedCardHeader task={task} visual={visual} typeLabel={typeLabel} Icon={Icon} />
      </div>

      {onOpenTask || bubbleUp ? (
        <div
          className="border-t border-border/60 bg-card px-2 py-1.5 dark:border-border"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <CardTabStrip
            taskId={task.id}
            onOpenTask={onOpenTask}
            bubbleUp={bubbleUp}
            bubblyDensity="default"
          />
        </div>
      ) : null}
    </div>
  );
}
