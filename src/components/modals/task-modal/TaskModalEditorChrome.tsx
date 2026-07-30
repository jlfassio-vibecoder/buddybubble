'use client';

import { Archive, Globe, Image as ImageIcon, Lock, MoreHorizontal } from 'lucide-react';
import { ITEM_TYPES_ORDER } from '@/lib/item-type-styles';
import { TaskModalTypeChip } from '@/components/modals/task-modal/TaskModalTypeChip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  WorkoutPlayerTriggers,
  type ActiveSessionLaunchControlProps,
} from '@/components/fitness/WorkoutPlayer';
import type { ItemType, TaskVisibility } from '@/types/database';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import type { Json } from '@/types/database';
import { PrivacyToggle } from '@/components/ui/privacy-toggle';

export type TaskModalEditorChromeProps = {
  showChrome: boolean;
  /** When false with showChrome, Type + Visibility are hidden (comments / thread focus); workout player may still show. */
  showTypeAndVisibility?: boolean;
  itemType: ItemType;
  onItemTypeChange: (next: ItemType) => void;
  /** When true, the Class type chip is shown in the selector (trainers / workspace admins). */
  canManageClasses: boolean;
  canWrite: boolean;
  visibility: TaskVisibility;
  onVisibilityChange: (next: TaskVisibility) => void;
  /** Card-based live video (tasks only; class uses `ClassEditor`). */
  liveStreamEnabled?: boolean;
  onLiveStreamEnabledChange?: (next: boolean) => void;
  workoutTitle: string;
  /** Raw task metadata (workout exercise list lives under `exercises`). */
  workoutMetadata: Json;
  bubbleId: string | null;
  workspaceId: string;
  taskId: string | null;
  activeSessionLaunch?: Pick<
    ActiveSessionLaunchControlProps,
    'launchUi' | 'onLaunchClick' | 'busy'
  > | null;
  /** Fires on click in the type or visibility / workout player sections (capture phase). */
  onInteraction?: () => void;
  /** Opens the cover-image file picker (`.tm-iconbtn`); hidden until the card is saved. */
  onPickCardCover?: () => void;
  /** Archive action surfaced as a "more" icon button, mirroring the footer's Danger zone. */
  onArchiveTask?: () => void | Promise<void>;
  archiving?: boolean;
};

export function TaskModalEditorChrome({
  showChrome,
  showTypeAndVisibility = true,
  itemType,
  onItemTypeChange,
  canManageClasses,
  canWrite,
  visibility,
  onVisibilityChange,
  liveStreamEnabled = false,
  onLiveStreamEnabledChange,
  workoutTitle,
  workoutMetadata,
  bubbleId,
  workspaceId,
  taskId,
  activeSessionLaunch = null,
  onInteraction,
  onPickCardCover,
  onArchiveTask,
  archiving = false,
}: TaskModalEditorChromeProps) {
  if (!showChrome) return null;

  const typeSelectorOrder = ITEM_TYPES_ORDER.filter((t) => t !== 'class' || canManageClasses);
  const showVisibilitySection = itemType !== 'class';
  const showLiveStreamToggle =
    itemType !== 'class' && typeof onLiveStreamEnabledChange === 'function';

  const notifyInteraction = () => {
    onInteraction?.();
  };

  const showWorkoutPlayer =
    (itemType === 'workout' || itemType === 'workout_log') &&
    metadataFieldsFromParsed(workoutMetadata ?? {}).workoutExercises.length > 0;

  return (
    <>
      {showTypeAndVisibility ? (
        <>
          <div
            className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3"
            onClickCapture={notifyInteraction}
          >
            <TaskModalTypeChip
              itemType={itemType}
              onItemTypeChange={onItemTypeChange}
              disabled={!canWrite}
              typesOrder={typeSelectorOrder}
            />
            {showVisibilitySection ? (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
                <span aria-hidden className="size-[3px] rounded-full bg-current opacity-60" />
                {visibility === 'public' ? (
                  <Globe className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                )}
                {visibility === 'public' ? 'Public' : 'Private'}
              </span>
            ) : null}
            {showLiveStreamToggle && liveStreamEnabled ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-primary/18 px-2.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">
                <span className="relative flex size-[7px]">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-full rounded-full bg-primary" />
                </span>
                Live huddle
              </span>
            ) : null}

            {onPickCardCover || onArchiveTask ? (
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {onPickCardCover ? (
                  <button
                    type="button"
                    aria-label="Add cover image"
                    disabled={!canWrite}
                    onClick={onPickCardCover}
                    className="flex size-[34px] items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    <ImageIcon className="size-4" aria-hidden />
                  </button>
                ) : null}
                {onArchiveTask ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="More card actions"
                      disabled={!canWrite || archiving}
                      className="flex size-[34px] items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void onArchiveTask()} disabled={archiving}>
                        <Archive className="size-4" aria-hidden />
                        {archiving ? 'Archiving…' : 'Archive card'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ) : null}
          </div>

          {showVisibilitySection ? (
            <div className="border-b border-border px-6 py-3" onClickCapture={notifyInteraction}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Visibility</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onVisibilityChange('private')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    visibility === 'private'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Lock className="size-4 shrink-0" aria-hidden />
                  Private
                </button>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onVisibilityChange('public')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    visibility === 'public'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Globe className="size-4 shrink-0" aria-hidden />
                  Public
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Public cards appear on your Astro storefront.
              </p>
            </div>
          ) : null}
          {showLiveStreamToggle ? (
            <div className="border-b border-border px-6 py-3" onClickCapture={notifyInteraction}>
              <PrivacyToggle
                id="task-live-stream"
                title="Enable live video stream"
                description="Adds a Join live session control on this card. End the session from the live dock when finished."
                checked={liveStreamEnabled}
                disabled={!canWrite}
                onCheckedChange={onLiveStreamEnabledChange}
              />
            </div>
          ) : null}
          {showWorkoutPlayer ? (
            <div className="border-b border-border px-6 py-3" onClickCapture={notifyInteraction}>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Workout player</p>
                <WorkoutPlayerTriggers
                  workoutTitle={workoutTitle}
                  metadata={workoutMetadata}
                  bubbleId={bubbleId ?? ''}
                  workspaceId={workspaceId}
                  sourceTaskId={taskId}
                  activeSessionLaunch={activeSessionLaunch}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
