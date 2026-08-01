'use client';

import { useState } from 'react';
import { Package, Users, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import { cn } from '@/lib/utils';

const AVATAR_PREVIEW = 5;

export type TaskModalEventCanvasProps = {
  canWrite: boolean;
  eventGoing: string;
  onEventGoingChange: (value: string) => void;
  eventCapacity: string;
  onEventCapacityChange: (value: string) => void;
  eventGoingPeople: string[];
  onEventGoingPeopleChange: (value: string[]) => void;
  eventBring: string[];
  onEventBringChange: (value: string[]) => void;
  isAgentField?: (key: string) => boolean;
  className?: string;
};

function ChipListEditor({
  values,
  onChange,
  canWrite,
  addPlaceholder,
  testId,
  chipIcon,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  canWrite: boolean;
  addPlaceholder: string;
  testId: string;
  chipIcon?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, t]);
    setDraft('');
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-semibold text-foreground"
          >
            {chipIcon ? <Package className="size-3 text-muted-foreground" aria-hidden /> : null}
            {v}
            {canWrite ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
        {values.length === 0 && !canWrite ? (
          <p className="text-xs text-muted-foreground" data-testid={`${testId}-empty`}>
            None yet
          </p>
        ) : null}
      </div>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            className={cn(taskModalInputClass, 'h-8 max-w-[200px]')}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={commit}
            data-testid={`${testId}-add`}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Handoff-aligned Event Details canvas: metadata-only Who’s going + What to bring.
 * No event enrollment backend / “I’m going” CTA this pass.
 */
export function TaskModalEventCanvas({
  canWrite,
  eventGoing,
  onEventGoingChange,
  eventCapacity,
  onEventCapacityChange,
  eventGoingPeople,
  onEventGoingPeopleChange,
  eventBring,
  onEventBringChange,
  isAgentField,
  className,
}: TaskModalEventCanvasProps) {
  const agent = (key: string) => Boolean(isAgentField?.(key));

  const goingN = (() => {
    const n = parseInt(eventGoing, 10);
    return !isNaN(n) && n >= 0 ? n : 0;
  })();
  const capacityN = (() => {
    const n = parseInt(eventCapacity, 10);
    return !isNaN(n) && n > 0 ? n : null;
  })();

  const spotsLabel =
    capacityN == null
      ? 'Unlimited spots'
      : `${Math.max(0, capacityN - goingN)} spot${capacityN - goingN === 1 ? '' : 's'} left`;

  const fillPct =
    capacityN == null || capacityN <= 0 ? 0 : Math.min(100, Math.round((goingN / capacityN) * 100));

  const shown = eventGoingPeople.slice(0, AVATAR_PREVIEW);
  const overflow = Math.max(0, eventGoingPeople.length - shown.length);

  return (
    <div className={className} data-testid="task-modal-event-canvas">
      <TaskModalSection
        icon={<Users className="size-4" aria-hidden />}
        title="Who’s going"
        sub="RSVP fill from this card’s metadata. There is no event enrollment table yet — counts and people labels are stored on the task."
      >
        <div
          className="flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-xl)] border border-border bg-background px-3.5 py-3.5"
          data-testid="task-modal-event-rsvp"
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="text-[13px] font-semibold tracking-tight text-foreground">
              <span data-testid="task-modal-event-rsvp-going">{goingN} going</span>
              <span className="text-muted-foreground"> · {spotsLabel}</span>
            </div>

            {shown.length > 0 ? (
              <AvatarGroup
                className="-space-x-1.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:ring-1 *:data-[slot=avatar]:ring-background"
                data-testid="task-modal-event-rsvp-avatars"
              >
                {shown.map((label) => {
                  const initial = label.slice(0, 2).toUpperCase() || '?';
                  return (
                    <Avatar key={label} size="sm" title={label}>
                      <AvatarFallback className="text-[10px] text-muted-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
                {overflow > 0 ? (
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-background"
                    data-testid="task-modal-event-rsvp-avatar-overflow"
                  >
                    +{overflow}
                  </span>
                ) : null}
              </AvatarGroup>
            ) : null}

            {capacityN != null ? (
              <Progress
                value={fillPct}
                className="max-w-xs"
                data-testid="task-modal-event-rsvp-progress"
              />
            ) : null}
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <TaskModalField label="Going" agent={agent('going')} className="mb-0">
            <input
              type="number"
              min={0}
              value={eventGoing}
              onChange={(e) => onEventGoingChange(e.target.value)}
              disabled={!canWrite}
              aria-label="Going count"
              className={taskModalInputClass}
              data-testid="task-modal-event-going-input"
            />
          </TaskModalField>
          <TaskModalField label="Capacity" optional agent={agent('capacity')} className="mb-0">
            <input
              type="number"
              min={1}
              value={eventCapacity}
              onChange={(e) => onEventCapacityChange(e.target.value)}
              disabled={!canWrite}
              placeholder="Unlimited"
              aria-label="Capacity"
              className={taskModalInputClass}
              data-testid="task-modal-event-capacity-input"
            />
          </TaskModalField>
        </div>

        <TaskModalField
          label="People labels"
          optional
          agent={agent('going_people')}
          className="mb-0 mt-3.5"
        >
          <ChipListEditor
            values={eventGoingPeople}
            onChange={onEventGoingPeopleChange}
            canWrite={canWrite}
            addPlaceholder="Add initials…"
            testId="task-modal-event-people"
          />
        </TaskModalField>

        <TaskModalField label="What to bring" agent={agent('bring')} className="mb-0 mt-3.5">
          <ChipListEditor
            values={eventBring}
            onChange={onEventBringChange}
            canWrite={canWrite}
            addPlaceholder="Add item…"
            testId="task-modal-event-bring"
            chipIcon
          />
        </TaskModalField>
      </TaskModalSection>
    </div>
  );
}
