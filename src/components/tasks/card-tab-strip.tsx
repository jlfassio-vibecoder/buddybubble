'use client';

import type { OpenTaskOptions, TaskModalTab } from '@/types/open-task-options';
import { BubblyButton, type TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';

const CARD_SECTION_TABS = [
  ['details', 'Details'],
  ['comments', 'Comments'],
  ['subtasks', 'Subtasks'],
  ['activity', 'Activity'],
] as const satisfies readonly (readonly [TaskModalTab, string])[];

function openOptionsForTab(
  tab: TaskModalTab,
  taskCommentAnchorBubbleMessageId?: string | null,
): OpenTaskOptions {
  const base: OpenTaskOptions = {
    tab,
    viewMode: tab === 'comments' ? 'comments-only' : 'full',
  };
  const anchor = taskCommentAnchorBubbleMessageId?.trim();
  if (tab === 'comments' && anchor) {
    return { ...base, taskCommentAnchorBubbleMessageId: anchor };
  }
  return base;
}

export type CardTabStripProps = {
  taskId: string;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  bubbleUp?: Omit<TaskBubbleUpControlProps, 'density'>;
  /** Matches `BubblyButton` density; Kanban micro cards use `micro`. */
  bubblyDensity?: 'default' | 'micro';
  /** Passed through for Comments tab when opening from a bubble message embed. */
  taskCommentAnchorBubbleMessageId?: string | null;
};

const PILL_CLASS =
  'rounded-md px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/**
 * Shared Details / Comments / Subtasks / Activity pills for Kanban and chat card embeds.
 * Keeps `viewMode` in sync with the board (comments → comments-only).
 */
export function CardTabStrip({
  taskId,
  onOpenTask,
  bubbleUp,
  bubblyDensity = 'default',
  taskCommentAnchorBubbleMessageId = null,
}: CardTabStripProps) {
  if (!onOpenTask && !bubbleUp) {
    return null;
  }

  // Copilot suggestion ignored: GitHub’s bidirectional-Unicode warning on this file is a false positive for normal ASCII/JSX.
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Card sections">
      {onOpenTask
        ? CARD_SECTION_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={PILL_CLASS}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenTask(taskId, openOptionsForTab(id, taskCommentAnchorBubbleMessageId));
              }}
            >
              {label}
            </button>
          ))
        : null}
      {bubbleUp ? <BubblyButton {...bubbleUp} density={bubblyDensity} tabStrip /> : null}
    </div>
  );
}
