'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { taskModalInputClass } from '@/components/modals/task-modal/TaskModalSection';
import { cn } from '@/lib/utils';
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
  const done = subtasks.filter((s) => s.done).length;
  const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;

  return (
    <div>
      {subtasks.length > 0 ? (
        <div className="mb-3.5 flex items-center gap-3">
          <span className="text-xs font-bold tabular-nums text-foreground">
            {done}/{subtasks.length}
          </span>
          <Progress value={pct} className="flex-1" />
          <span className="text-xs font-bold tabular-nums text-foreground">{pct}%</span>
        </div>
      ) : null}
      <ul>
        {subtasks.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-2.5 border-b border-border/60 py-2.5 last:border-b-0"
          >
            <Checkbox
              checked={s.done}
              onCheckedChange={() => void onToggleSubtask(s.id)}
              disabled={!canWrite || !taskId}
            />
            <span
              className={cn(
                'flex-1 text-[13.5px]',
                s.done ? 'text-muted-foreground line-through' : 'text-foreground',
              )}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ul>
      {canWrite && taskId ? (
        <div className="mt-3.5 flex gap-2">
          <input
            placeholder="Add subtask"
            value={newSubtaskTitle}
            onChange={(e) => onNewSubtaskTitleChange(e.target.value)}
            className={taskModalInputClass}
          />
          <Button
            type="button"
            onClick={() => void onAddSubtask()}
            disabled={!newSubtaskTitle.trim()}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </div>
      ) : null}
      {isCreateMode ? (
        <p className="mt-3.5 text-xs text-muted-foreground">
          Create the {typeNoun} to add subtasks.
        </p>
      ) : null}
    </div>
  );
}
