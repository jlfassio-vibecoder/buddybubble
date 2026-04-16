'use client';

import type { TaskActivityEntry } from '@/types/task-modal';
import { formatActivityLine } from './task-modal-activity-utils';

export type TaskModalActivityPanelProps = {
  activityLog: TaskActivityEntry[];
};

export function TaskModalActivityPanel({ activityLog }: TaskModalActivityPanelProps) {
  if (activityLog.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {activityLog.map((e) => (
        <li
          key={e.id}
          className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
        >
          <p>{formatActivityLine(e)}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {new Date(e.at).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
