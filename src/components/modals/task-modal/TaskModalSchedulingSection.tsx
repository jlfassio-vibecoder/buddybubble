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
import {
  combineEventEnds,
  isEventEndsBeforeOrEqualStart,
  splitEventEnds,
} from '@/lib/item-metadata';

export type TaskModalSchedulingSectionProps = {
  itemType: ItemType;
  dateLabels: TaskDateFieldLabels;
  scheduledOn: string;
  onScheduledOnChange: (value: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (value: string) => void;
  canWrite: boolean;
  /** Event: `metadata.ends` as YYYY-MM-DDTHH:mm. */
  eventEnds?: string;
  onEventEndsChange?: (value: string) => void;
  isAgentField?: (key: string) => boolean;
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
  eventEnds = '',
  onEventEndsChange,
  isAgentField,
}: TaskModalSchedulingSectionProps) {
  if (itemType === 'experience') return null;

  const showEventEnds = itemType === 'event' && typeof onEventEndsChange === 'function';
  const endsParts = splitEventEnds(eventEnds);
  const endsSoftInvalid =
    showEventEnds && isEventEndsBeforeOrEqualStart(scheduledOn, scheduledTime, eventEnds);

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
              {showEventEnds ? 'Starts' : dateLabels.primary}
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
              {showEventEnds
                ? `Starts time${!scheduledOn ? ' (set a date first)' : ' (optional)'}`
                : `Time${!scheduledOn ? ' (set a date first)' : ' (optional)'}`}
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

      {showEventEnds ? (
        <TaskModalField
          label="Ends"
          optional
          agent={Boolean(isAgentField?.('ends'))}
          help="Optional end wall time for this event (workspace timezone)."
          className="mb-0 mt-3.5"
        >
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <Label
                htmlFor="task-event-ends-date"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Ends date
              </Label>
              <input
                id="task-event-ends-date"
                type="date"
                value={endsParts.date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  onEventEndsChange?.(nextDate ? combineEventEnds(nextDate, endsParts.time) : '');
                }}
                disabled={!canWrite}
                className={taskModalInputClass}
                data-testid="task-modal-event-ends-date"
              />
            </div>
            <div>
              <Label
                htmlFor="task-event-ends-time"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Ends time {!endsParts.date ? '(set a date first)' : '(optional)'}
              </Label>
              <input
                id="task-event-ends-time"
                type="time"
                value={endsParts.time}
                onChange={(e) => {
                  onEventEndsChange?.(combineEventEnds(endsParts.date, e.target.value));
                }}
                disabled={!canWrite || !endsParts.date}
                className={taskModalInputClass}
                data-testid="task-modal-event-ends-time"
              />
            </div>
          </div>
          {endsSoftInvalid ? (
            <p
              className="mt-2 text-xs text-destructive"
              role="status"
              data-testid="task-modal-event-ends-soft-error"
            >
              End should be after the start time.
            </p>
          ) : null}
        </TaskModalField>
      ) : null}
    </TaskModalSection>
  );
}
