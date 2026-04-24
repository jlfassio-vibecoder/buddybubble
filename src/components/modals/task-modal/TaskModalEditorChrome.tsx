'use client';

import { Globe, Lock } from 'lucide-react';
import { ItemTypeSelector } from '@/components/board/item-type-selector';
import { ITEM_TYPES_ORDER } from '@/lib/item-type-styles';
import { WorkoutPlayerTriggers } from '@/components/fitness/WorkoutPlayer';
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
  /** Fires on click in the type or visibility / workout player sections (capture phase). */
  onInteraction?: () => void;
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
  onInteraction,
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
          <div className="border-b border-border px-6 py-3" onClickCapture={notifyInteraction}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Type</p>
            <ItemTypeSelector
              value={itemType}
              onChange={onItemTypeChange}
              disabled={!canWrite}
              typesOrder={typeSelectorOrder}
            />
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
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
