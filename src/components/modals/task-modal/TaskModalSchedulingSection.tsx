'use client';

import { Label } from '@/components/ui/label';
import { TASK_PRIORITY_OPTIONS, type TaskPriority } from '@/lib/task-priority';
import type { TaskDateFieldLabels } from '@/lib/task-date-labels';
import type { ItemType } from '@/types/database';

export type TaskModalSchedulingStatusOption = { value: string; label: string };

export type TaskModalSchedulingSectionProps = {
  itemType: ItemType;
  dateLabels: TaskDateFieldLabels;
  status: string;
  onStatusChange: (value: string) => void;
  statusSelectOptions: TaskModalSchedulingStatusOption[];
  priority: TaskPriority;
  onPriorityChange: (value: TaskPriority) => void;
  workspaceId: string | null;
  assignedTo: string | null;
  onAssignedToChange: (userId: string | null) => void;
  workspaceMembersForAssign: { user_id: string; label: string }[];
  scheduledOn: string;
  onScheduledOnChange: (value: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (value: string) => void;
  canWrite: boolean;
};

export function TaskModalSchedulingSection({
  itemType,
  dateLabels,
  status,
  onStatusChange,
  statusSelectOptions,
  priority,
  onPriorityChange,
  workspaceId,
  assignedTo,
  onAssignedToChange,
  workspaceMembersForAssign,
  scheduledOn,
  onScheduledOnChange,
  scheduledTime,
  onScheduledTimeChange,
  canWrite,
}: TaskModalSchedulingSectionProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="task-status">Status</Label>
        <select
          id="task-status"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          disabled={!canWrite}
          className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          {statusSelectOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-priority">Priority</Label>
        <select
          id="task-priority"
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value as TaskPriority)}
          disabled={!canWrite}
          className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          {TASK_PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {workspaceId ? (
        <div className="space-y-2">
          <Label htmlFor="task-assigned-to">Assigned to</Label>
          <select
            id="task-assigned-to"
            value={assignedTo ?? ''}
            onChange={(e) => onAssignedToChange(e.target.value ? e.target.value : null)}
            disabled={!canWrite}
            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {workspaceMembersForAssign.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Owner or member responsible for this card (including programs).
          </p>
        </div>
      ) : null}
      {itemType !== 'experience' && (
        <div className="space-y-2">
          <div className="flex flex-row flex-wrap gap-3 items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="task-scheduled-on">{dateLabels.primary}</Label>
              <input
                id="task-scheduled-on"
                type="date"
                value={scheduledOn}
                onChange={(e) => onScheduledOnChange(e.target.value)}
                disabled={!canWrite}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="task-scheduled-time">
                Time {!scheduledOn ? '(set a date first)' : '(optional)'}
              </Label>
              <input
                id="task-scheduled-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => onScheduledTimeChange(e.target.value)}
                disabled={!canWrite || !scheduledOn}
                className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              />
            </div>
          </div>
          {dateLabels.helper ? (
            <p className="text-xs text-muted-foreground">{dateLabels.helper}</p>
          ) : null}
        </div>
      )}
    </>
  );
}
