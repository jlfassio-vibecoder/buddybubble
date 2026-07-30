'use client';

import type { ReactNode } from 'react';
import { Globe, Lock } from 'lucide-react';
import {
  WorkoutPlayerTriggers,
  type ActiveSessionLaunchControlProps,
} from '@/components/fitness/WorkoutPlayer';
import type { ItemType, TaskVisibility } from '@/types/database';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';

export type TaskModalEditorChromeProps = {
  showChrome: boolean;
  /**
   * When false with showChrome, Visibility / Live are hidden (comments reading-context);
   * workout player may still show.
   */
  showTypeAndVisibility?: boolean;
  itemType: ItemType;
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
  /** Fires on click in visibility / workout player sections (capture phase). */
  onInteraction?: () => void;
};

/** Consistent chrome block: external title + description + bordered control surface. */
function ChromeField({
  title,
  description,
  children,
  onClickCapture,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClickCapture?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('border-b border-border px-6 py-3', className)}
      onClickCapture={onClickCapture}
    >
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {description ? (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">{children}</div>
    </div>
  );
}

/**
 * Persistent chrome: Visibility / Live (all tabs) + Workout player.
 * Cover header chips are read-only echoes of these controls.
 */
export function TaskModalEditorChrome({
  showChrome,
  showTypeAndVisibility = true,
  itemType,
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
}: TaskModalEditorChromeProps) {
  if (!showChrome) return null;

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
          {showVisibilitySection ? (
            <ChromeField
              title="Visibility"
              description="Public cards appear on your Astro storefront."
              onClickCapture={notifyInteraction}
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onVisibilityChange('private')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    visibility === 'private'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Lock className="size-4 shrink-0" aria-hidden />
                  Private
                </button>
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => onVisibilityChange('public')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    visibility === 'public'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Globe className="size-4 shrink-0" aria-hidden />
                  Public
                </button>
              </div>
            </ChromeField>
          ) : null}
          {showLiveStreamToggle ? (
            <ChromeField
              title="Live video"
              description="Adds a Join live session control on this card. End the session from the live dock when finished."
              onClickCapture={notifyInteraction}
            >
              <label className="flex cursor-pointer items-start gap-3" htmlFor="task-live-stream">
                <input
                  id="task-live-stream"
                  type="checkbox"
                  checked={liveStreamEnabled}
                  disabled={!canWrite}
                  onChange={(e) => onLiveStreamEnabledChange?.(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                />
                <span className="text-sm font-semibold text-foreground">
                  Enable live video stream
                </span>
              </label>
            </ChromeField>
          ) : null}
        </>
      ) : null}
      {showWorkoutPlayer ? (
        <ChromeField
          title="Workout player"
          description="Launch an Active Session or open the desktop/mobile player for this workout."
          onClickCapture={notifyInteraction}
        >
          <WorkoutPlayerTriggers
            workoutTitle={workoutTitle}
            metadata={workoutMetadata}
            bubbleId={bubbleId ?? ''}
            workspaceId={workspaceId}
            sourceTaskId={taskId}
            activeSessionLaunch={activeSessionLaunch}
          />
        </ChromeField>
      ) : null}
    </>
  );
}
