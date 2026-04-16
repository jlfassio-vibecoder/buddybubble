'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TaskSubtask } from '@/types/task-modal';

export type TaskModalSubtasksPanelProps = {
  subtasks: TaskSubtask[];
  newSubtaskTitle: string;
  onNewSubtaskTitleChange: (value: string) => void;
  onAddSubtask: () => void | Promise<void>;
  onToggleSubtask: (id: string) => void | Promise<void>;
  canWrite: boolean;
  taskId: string | null;
  isCreateMode: boolean;
  typeNoun: string;
};

export function TaskModalSubtasksPanel({
  subtasks,
  newSubtaskTitle,
  onNewSubtaskTitleChange,
  onAddSubtask,
  onToggleSubtask,
  canWrite,
  taskId,
  isCreateMode,
  typeNoun,
}: TaskModalSubtasksPanelProps) {
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.done}
              onChange={() => void onToggleSubtask(s.id)}
              disabled={!canWrite || !taskId}
              className="rounded border-input"
            />
            <span className={s.done ? 'text-muted-foreground line-through' : 'text-foreground'}>
              {s.title}
            </span>
          </li>
        ))}
      </ul>
      {canWrite && taskId ? (
        <div className="flex gap-2">
          <Input
            placeholder="New subtask"
            value={newSubtaskTitle}
            onChange={(e) => onNewSubtaskTitleChange(e.target.value)}
            className="h-9"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void onAddSubtask()}
            disabled={!newSubtaskTitle.trim()}
          >
            Add
          </Button>
        </div>
      ) : null}
      {isCreateMode ? (
        <p className="text-xs text-muted-foreground">Create the {typeNoun} to add subtasks.</p>
      ) : null}
    </div>
  );
}
