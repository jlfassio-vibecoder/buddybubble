'use client';

import { CalendarDays } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
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
    <TaskModalSection icon={<CalendarDays className="size-4" aria-hidden />} title="Schedule">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <TaskModalField label="Status">
          <Select
            value={status}
            onValueChange={(v) => onStatusChange(String(v))}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusSelectOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TaskModalField>
        <TaskModalField label="Priority">
          <Select
            value={priority}
            onValueChange={(v) => onPriorityChange(v as TaskPriority)}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TaskModalField>
      </div>

      {workspaceId ? (
        <TaskModalField
          label="Assigned to"
          help="Owner or member responsible for this card (including programs)."
        >
          <Select
            value={assignedTo}
            onValueChange={(v) => onAssignedToChange(v == null || v === '' ? null : String(v))}
            disabled={!canWrite}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {/* Copilot suggestion ignored: Unassigned already uses SelectItem value={null}. */}
              <SelectItem value={null}>Unassigned</SelectItem>
              {workspaceMembersForAssign.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TaskModalField>
      ) : null}

      {itemType !== 'experience' && (
        <TaskModalField help={dateLabels.helper || undefined}>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <Label
                htmlFor="task-scheduled-on"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                {dateLabels.primary}
              </Label>
              <input
                id="task-scheduled-on"
                type="date"
                value={scheduledOn}
                onChange={(e) => onScheduledOnChange(e.target.value)}
                disabled={!canWrite}
                className={taskModalInputClass}
              />
            </div>
            <div>
              <Label
                htmlFor="task-scheduled-time"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Time {!scheduledOn ? '(set a date first)' : '(optional)'}
              </Label>
              <input
                id="task-scheduled-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => onScheduledTimeChange(e.target.value)}
                disabled={!canWrite || !scheduledOn}
                className={taskModalInputClass}
              />
            </div>
          </div>
        </TaskModalField>
      )}
    </TaskModalSection>
  );
}
