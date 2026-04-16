'use client';

import { Globe, ListTree, Lock } from 'lucide-react';
import { ItemTypeSelector } from '@/components/board/item-type-selector';
import { WorkoutPlayerTriggers } from '@/components/fitness/WorkoutPlayer';
import { Button } from '@/components/ui/button';
import type { ItemType, TaskVisibility } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';

export type TaskModalEditorChromeProps = {
  showChrome: boolean;
  itemType: ItemType;
  onItemTypeChange: (next: ItemType) => void;
  canWrite: boolean;
  visibility: TaskVisibility;
  onVisibilityChange: (next: TaskVisibility) => void;
  hasWorkoutViewerContent: boolean;
  onOpenWorkoutViewer: () => void;
  workoutTitle: string;
  workoutExercises: WorkoutExercise[];
  bubbleId: string | null;
  workspaceId: string;
  taskId: string | null;
};

export function TaskModalEditorChrome({
  showChrome,
  itemType,
  onItemTypeChange,
  canWrite,
  visibility,
  onVisibilityChange,
  hasWorkoutViewerContent,
  onOpenWorkoutViewer,
  workoutTitle,
  workoutExercises,
  bubbleId,
  workspaceId,
  taskId,
}: TaskModalEditorChromeProps) {
  if (!showChrome) return null;

  return (
    <>
      <div className="border-b border-border px-6 py-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Type</p>
        <ItemTypeSelector value={itemType} onChange={onItemTypeChange} disabled={!canWrite} />
      </div>

      <div className="border-b border-border px-6 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Visibility</p>
          {hasWorkoutViewerContent ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onOpenWorkoutViewer}
            >
              <ListTree className="h-3 w-3 shrink-0" aria-hidden />
              Workout viewer
            </Button>
          ) : null}
        </div>
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
        {(itemType === 'workout' || itemType === 'workout_log') && workoutExercises.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Workout player</p>
            <WorkoutPlayerTriggers
              workoutTitle={workoutTitle}
              exercises={workoutExercises}
              bubbleId={bubbleId ?? ''}
              workspaceId={workspaceId}
              sourceTaskId={taskId}
            />
          </div>
        )}
      </div>
    </>
  );
}
