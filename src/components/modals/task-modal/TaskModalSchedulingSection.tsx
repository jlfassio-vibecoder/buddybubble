'use client';

import { CalendarDays } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import type { TaskDateFieldLabels } from '@/lib/task-date-labels';
import type { ItemType } from '@/types/database';

export type TaskModalSchedulingSectionProps = {
  itemType: ItemType;
  dateLabels: TaskDateFieldLabels;
  scheduledOn: string;
  onScheduledOnChange: (value: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (value: string) => void;
  canWrite: boolean;
};

/** Handoff Schedule section — date/time only (board metadata lives in Properties). */
export function TaskModalSchedulingSection({
  itemType,
  dateLabels,
  scheduledOn,
  onScheduledOnChange,
  scheduledTime,
  onScheduledTimeChange,
  canWrite,
}: TaskModalSchedulingSectionProps) {
  if (itemType === 'experience') return null;

  return (
    <TaskModalSection
      icon={<CalendarDays className="size-4" aria-hidden />}
      title="Schedule"
      sub="Cards surface in Today on that calendar day (workspace time)."
    >
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
    </TaskModalSection>
  );
}
