'use client';

import { SlidersHorizontal } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskModalField, TaskModalSection } from '@/components/modals/task-modal/TaskModalSection';
import { TASK_PRIORITY_OPTIONS, type TaskPriority } from '@/lib/task-priority';

export type TaskModalPropertiesStatusOption = { value: string; label: string };

export type TaskModalPropertiesSectionProps = {
  status: string;
  onStatusChange: (value: string) => void;
  statusSelectOptions: TaskModalPropertiesStatusOption[];
  priority: TaskPriority;
  onPriorityChange: (value: TaskPriority) => void;
  workspaceId: string | null;
  assignedTo: string | null;
  onAssignedToChange: (userId: string | null) => void;
  workspaceMembersForAssign: { user_id: string; label: string }[];
  canWrite: boolean;
};

/**
 * Handoff Properties section — board metadata (status / priority / assignee).
 * Visibility / Live are persistent in `TaskModalEditorChrome` (all tabs).
 */
export function TaskModalPropertiesSection({
  status,
  onStatusChange,
  statusSelectOptions,
  priority,
  onPriorityChange,
  workspaceId,
  assignedTo,
  onAssignedToChange,
  workspaceMembersForAssign,
  canWrite,
}: TaskModalPropertiesSectionProps) {
  return (
    <TaskModalSection
      icon={<SlidersHorizontal className="size-4" aria-hidden />}
      title="Properties"
      hint="Board metadata"
      first
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
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
      </div>
    </TaskModalSection>
  );
}
