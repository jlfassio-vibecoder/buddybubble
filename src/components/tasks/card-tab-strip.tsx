'use client';

import type { OpenTaskOptions, TaskModalTab } from '@/components/modals/TaskModal';
import { BubblyButton, type TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';

const CARD_SECTION_TABS = [
  ['details', 'Details'],
  ['comments', 'Comments'],
  ['subtasks', 'Subtasks'],
  ['activity', 'Activity'],
] as const satisfies readonly (readonly [TaskModalTab, string])[];

function openOptionsForTab(tab: TaskModalTab): OpenTaskOptions {
  return {
    tab,
    viewMode: tab === 'comments' ? 'comments-only' : 'full',
  };
}

export type CardTabStripProps = {
  taskId: string;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  bubbleUp?: Omit<TaskBubbleUpControlProps, 'density'>;
  /** Matches `BubblyButton` density; Kanban micro cards use `micro`. */
  bubblyDensity?: 'default' | 'micro';
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
}: CardTabStripProps) {
  if (!onOpenTask && !bubbleUp) {
    return null;
  }

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
                onOpenTask(taskId, openOptionsForTab(id));
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
