'use client';

import { useRef } from 'react';
import { CalendarDays, Camera, Plus, Users, X } from 'lucide-react';
import { ChatMessageReactionPills } from '@/components/chat/ChatMessageReactionPills';
import { Avatar, AvatarFallback, AvatarGroup } from '@/components/ui/avatar';
import { TaskAttachmentImagePreview } from '@/components/modals/task-modal/task-modal-media';
import { TaskModalChipListEditor } from '@/components/modals/task-modal/TaskModalChipListEditor';
import {
  TaskModalField,
  TaskModalSection,
  taskModalInputClass,
} from '@/components/modals/task-modal/TaskModalSection';
import { isLikelyTaskAttachmentImageFileName } from '@/lib/task-attachment-url';
import {
  memoryReactionAggs,
  toggleMemoryMomentReaction,
  type MemoryMomentReaction,
} from '@/lib/memory-moment-reactions';
import type { MessageReactionEmoji } from '@/lib/message-reactions';
import type { TaskAttachment } from '@/types/task-modal';
import { cn } from '@/lib/utils';

export type TaskModalMemoryCanvasProps = {
  attachments: TaskAttachment[];
  canWrite: boolean;
  isCreateMode: boolean;
  taskId: string | null;
  typeNoun: string;
  onPickAttachmentFile: (file: File) => void | Promise<void>;
  onDownloadAttachment: (att: TaskAttachment) => void | Promise<void>;
  onRemoveAttachment: (att: TaskAttachment) => void | Promise<void>;
  memoryLinkedEvent?: string;
  onMemoryLinkedEventChange?: (value: string) => void;
  memoryLocation?: string;
  onMemoryLocationChange?: (value: string) => void;
  memoryPeople?: string[];
  onMemoryPeopleChange?: (value: string[]) => void;
  memoryReactions?: MemoryMomentReaction[];
  onMemoryReactionsChange?: (value: MemoryMomentReaction[]) => void;
  currentUserId?: string | null;
  className?: string;
  isAgentField?: (key: string) => boolean;
};

const AVATAR_STACK_MAX = 5;

/**
 * Handoff-aligned Memory Details: From chip, Photos gallery, people + moment reactions.
 * Caption / happened-on stay in Moment metadata + Schedule.
 */
export function TaskModalMemoryCanvas({
  attachments,
  canWrite,
  isCreateMode,
  taskId,
  typeNoun,
  onPickAttachmentFile,
  onDownloadAttachment,
  onRemoveAttachment,
  memoryLinkedEvent = '',
  onMemoryLinkedEventChange,
  memoryLocation = '',
  onMemoryLocationChange,
  memoryPeople = [],
  onMemoryPeopleChange,
  memoryReactions = [],
  onMemoryReactionsChange,
  currentUserId = null,
  className,
  isAgentField,
}: TaskModalMemoryCanvasProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const images = attachments.filter((a) => isLikelyTaskAttachmentImageFileName(a.name));
  const canAdd = Boolean(canWrite && !isCreateMode && taskId);
  const agent = (key: string) => Boolean(isAgentField?.(key));
  const linked = memoryLinkedEvent.trim();
  const shown = memoryPeople.slice(0, AVATAR_STACK_MAX);
  const overflow = Math.max(0, memoryPeople.length - AVATAR_STACK_MAX);
  const reactionAggs = memoryReactionAggs(memoryReactions, currentUserId);
  const canReact = Boolean(canWrite && currentUserId && onMemoryReactionsChange);

  const handleToggleReaction = (emoji: MessageReactionEmoji) => {
    if (!currentUserId || !onMemoryReactionsChange) return;
    onMemoryReactionsChange(toggleMemoryMomentReaction(memoryReactions, emoji, currentUserId));
  };

  return (
    <div className={className} data-testid="task-modal-memory-canvas">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TaskModalField label="From" optional agent={agent('linked_event')} className="mb-0">
          {canWrite && onMemoryLinkedEventChange ? (
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                value={memoryLinkedEvent}
                onChange={(e) => onMemoryLinkedEventChange(e.target.value)}
                placeholder="Event title or id"
                aria-label="Linked event"
                className={`${taskModalInputClass} pl-9`}
                data-testid="task-modal-memory-linked-event"
              />
            </div>
          ) : linked ? (
            <span
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 text-[12px] font-semibold text-primary"
              data-testid="task-modal-memory-linked-event-chip"
            >
              <CalendarDays className="size-3.5 shrink-0" aria-hidden />
              {linked}
            </span>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="task-modal-memory-linked-event-empty"
            >
              No linked event
            </p>
          )}
        </TaskModalField>
        <TaskModalField label="Location" optional agent={agent('location')} className="mb-0">
          {canWrite && onMemoryLocationChange ? (
            <input
              type="text"
              value={memoryLocation}
              onChange={(e) => onMemoryLocationChange(e.target.value)}
              placeholder="Where it happened"
              aria-label="Location"
              className={taskModalInputClass}
              data-testid="task-modal-memory-location"
            />
          ) : memoryLocation.trim() ? (
            <p className="text-[14.5px] text-foreground" data-testid="task-modal-memory-location">
              {memoryLocation.trim()}
            </p>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="task-modal-memory-location-empty"
            >
              No location
            </p>
          )}
        </TaskModalField>
      </div>

      <TaskModalSection
        icon={<Camera className="size-4" aria-hidden />}
        title="Photos"
        sub={
          isCreateMode
            ? `Save the ${typeNoun} first, then add photos here or under Attachments.`
            : 'Images from this memory. Non-image files stay under Attachments.'
        }
      >
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          data-testid="task-modal-memory-gallery"
        >
          {images.map((a) => (
            <div
              key={a.id}
              className="group relative aspect-square overflow-hidden rounded-[var(--radius-xl)] border border-border bg-secondary"
            >
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center"
                onClick={() => void onDownloadAttachment(a)}
                aria-label={`Open ${a.name}`}
              >
                <span className="pointer-events-none scale-150">
                  <TaskAttachmentImagePreview path={a.path} />
                </span>
              </button>
              {canWrite && !isCreateMode ? (
                <button
                  type="button"
                  className={cn(
                    'absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity',
                    'hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                  aria-label={`Remove ${a.name}`}
                  onClick={() => void onRemoveAttachment(a)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}

          {canAdd ? (
            <button
              type="button"
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-xl)] border border-dashed border-border bg-transparent text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              data-testid="task-modal-memory-add-photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="size-5" aria-hidden strokeWidth={2} />
              <span className="text-[11px] font-semibold">Add photo</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void onPickAttachmentFile(f);
                }}
              />
            </button>
          ) : null}
        </div>

        {images.length === 0 && !canAdd ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="task-modal-memory-empty">
            No photos yet.
          </p>
        ) : null}
      </TaskModalSection>

      <TaskModalSection
        icon={<Users className="size-4" aria-hidden />}
        title="People & reactions"
        sub="Tag who was there and react to the moment. Stored on this card’s metadata — separate from Comments reactions."
      >
        <TaskModalField label="Tagged" agent={agent('people')}>
          <div className="flex flex-wrap items-center gap-3" data-testid="task-modal-memory-people">
            {shown.length > 0 ? (
              <AvatarGroup className="-space-x-1.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:ring-1 *:data-[slot=avatar]:ring-background">
                {shown.map((label, i) => {
                  const initial = label.slice(0, 2).toUpperCase() || '?';
                  return (
                    <Avatar key={`${label}-${i}`} size="sm" title={label}>
                      <AvatarFallback className="text-[10px] text-muted-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                  );
                })}
                {overflow > 0 ? (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-background">
                    +{overflow}
                  </span>
                ) : null}
              </AvatarGroup>
            ) : null}
            <span className="text-[13px] font-semibold text-muted-foreground">
              {memoryPeople.length} tagged
            </span>
          </div>
          {onMemoryPeopleChange ? (
            <div className="mt-3">
              <TaskModalChipListEditor
                values={memoryPeople}
                onChange={onMemoryPeopleChange}
                canWrite={canWrite}
                addPlaceholder="Add name or initials…"
                testId="task-modal-memory-people-chips"
              />
            </div>
          ) : null}
        </TaskModalField>

        <TaskModalField label="Reactions" optional agent={agent('reactions')} className="mt-3.5">
          <div data-testid="task-modal-memory-reactions">
            <ChatMessageReactionPills
              reactions={reactionAggs}
              canReact={canReact}
              onToggleReaction={handleToggleReaction}
              className="mt-0"
            />
            {!canReact && reactionAggs.length === 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="task-modal-memory-reactions-empty"
              >
                No reactions yet
              </p>
            ) : null}
          </div>
        </TaskModalField>
      </TaskModalSection>
    </div>
  );
}
