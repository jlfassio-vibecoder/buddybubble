'use client';

import { Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import { TaskModalChipListEditor } from '@/components/modals/task-modal/TaskModalChipListEditor';

const AVATAR_PREVIEW = 5;

export type EventRsvpPerson = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TaskModalEventCanvasProps = {
  canWrite: boolean;
  eventCapacity: string;
  onEventCapacityChange: (value: string) => void;
  eventBring: string[];
  onEventBringChange: (value: string[]) => void;
  eventCost: string;
  onEventCostChange: (value: string) => void;
  /** Ledger-derived going count (preferred over metadata.going). */
  goingCount: number;
  rsvpPeople: EventRsvpPerson[];
  isGoing: boolean;
  onToggleGoing: () => void;
  goingBusy?: boolean;
  /** True in create mode until the event task exists. */
  goingDisabled?: boolean;
  rsvpLoading?: boolean;
  isAgentField?: (key: string) => boolean;
  className?: string;
};

/**
 * Event Details canvas: ledger-backed Who’s going + host capacity/bring/cost.
 * Going count and avatars come from `event_rsvps`; metadata going/going_people are not edited here.
 */
export function TaskModalEventCanvas({
  canWrite,
  eventCapacity,
  onEventCapacityChange,
  eventBring,
  onEventBringChange,
  eventCost,
  onEventCostChange,
  goingCount,
  rsvpPeople,
  isGoing,
  onToggleGoing,
  goingBusy = false,
  goingDisabled = false,
  rsvpLoading = false,
  isAgentField,
  className,
}: TaskModalEventCanvasProps) {
  const agent = (key: string) => Boolean(isAgentField?.(key));

  const capacityN = (() => {
    const n = parseInt(eventCapacity, 10);
    return !isNaN(n) && n > 0 ? n : null;
  })();

  const spotsLabel =
    capacityN == null
      ? 'Unlimited spots'
      : `${Math.max(0, capacityN - goingCount)} spot${capacityN - goingCount === 1 ? '' : 's'} left`;

  const fillPct =
    capacityN == null || capacityN <= 0
      ? 0
      : Math.min(100, Math.round((goingCount / capacityN) * 100));

  const shown = rsvpPeople.slice(0, AVATAR_PREVIEW);
  const overflow = Math.max(0, rsvpPeople.length - shown.length);
  const atCapacity = capacityN != null && goingCount >= capacityN && !isGoing;

  return (
    <div className={className} data-testid="task-modal-event-canvas">
      <TaskModalSection
        icon={<Users className="size-4" aria-hidden />}
        title="Who’s going"
        sub="RSVP from this card. Capacity is set by the host; going count comes from real enrollments."
      >
        <div
          className="flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-xl)] border border-border bg-background px-3.5 py-3.5"
          data-testid="task-modal-event-rsvp"
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="text-[13px] font-semibold tracking-tight text-foreground">
              {rsvpLoading && rsvpPeople.length === 0 ? (
                <span className="text-muted-foreground">Loading RSVPs…</span>
              ) : (
                <>
                  <span data-testid="task-modal-event-rsvp-going">{goingCount} going</span>
                  <span className="text-muted-foreground"> · {spotsLabel}</span>
                </>
              )}
            </div>

            {shown.length > 0 ? (
              <AvatarGroup
                className="-space-x-1.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:ring-1 *:data-[slot=avatar]:ring-background"
                data-testid="task-modal-event-rsvp-avatars"
              >
                {shown.map((person) => {
                  const initial = person.displayName.slice(0, 1).toUpperCase() || '?';
                  return (
                    <Avatar key={person.id} size="sm" title={person.displayName}>
                      {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
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

          <Button
            type="button"
            variant={isGoing ? 'outline' : 'default'}
            size="sm"
            disabled={goingDisabled || goingBusy || (!isGoing && atCapacity)}
            onClick={onToggleGoing}
            data-testid="task-modal-event-im-going"
          >
            {goingBusy ? 'Updating…' : isGoing ? 'Not going' : 'I’m going'}
          </Button>
        </div>

        <TaskModalField label="Capacity" optional agent={agent('capacity')} className="mb-0 mt-3.5">
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

        <TaskModalField label="What to bring" agent={agent('bring')} className="mb-0 mt-3.5">
          <TaskModalChipListEditor
            values={eventBring}
            onChange={onEventBringChange}
            canWrite={canWrite}
            addPlaceholder="Add item…"
            testId="task-modal-event-bring"
            chipIcon
          />
        </TaskModalField>

        <TaskModalField label="Cost" optional agent={agent('cost')} className="mb-0 mt-3.5">
          <input
            type="text"
            value={eventCost}
            onChange={(e) => onEventCostChange(e.target.value)}
            disabled={!canWrite}
            placeholder="Free · $5 at door"
            aria-label="Cost"
            className={taskModalInputClass}
            data-testid="task-modal-event-cost"
          />
        </TaskModalField>
      </TaskModalSection>
    </div>
  );
}
