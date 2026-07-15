'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkoutViewerApplyPayload } from '@/components/fitness/workout-viewer-dialog';
import {
  WorkoutBlockListEditor,
  WorkoutBlockListRenderer,
} from '@/components/fitness/workout-block-renderer';
import { WorkoutCoachBriefSection } from '@/components/fitness/workout-block-renderer/WorkoutCoachBriefSection';
import {
  cloneWorkoutSessionBlocksForEditor,
  workoutSessionBlocksContentKey,
} from '@/lib/workout-factory/clone-workout-session-blocks';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { ExerciseCueRequestV1 } from '@/lib/agents/coach/exercise-cue-request';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { UnitSystem } from '@/types/database';

type ReviewMode = 'preview' | 'edit';

export type WorkoutBuilderGeneratedReviewChrome = {
  difficulty?: string;
  structureRationale?: string;
  sessionAdaptations?: string;
  cardTitle: string;
};

type WorkoutBuilderGeneratedReviewProps = {
  taskId: string;
  title: string;
  description: string;
  /** Resolved coach brief for preview (from `resolveWorkoutViewerNarrative`). */
  coachBrief?: string;
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  blocks: WorkoutSessionBlockView[];
  syncKey: string | number;
  chrome: WorkoutBuilderGeneratedReviewChrome;
  onApplyEdits: (payload: WorkoutViewerApplyPayload) => void;
  onSaveAndReturn: () => void | Promise<void>;
  onReturn: () => void;
  saving: boolean;
  coreDirty: boolean;
  cuesByKey?: Record<string, ResolvedCueBundle>;
  cuesLoading?: boolean;
  onAskCoachForCues?: (payload: ExerciseCueRequestV1) => void;
  onCueSave?: (key: string, patch: WorkoutCuePatch) => void;
  injuriesOnFile?: boolean;
};

export function WorkoutBuilderGeneratedReview({
  taskId,
  title,
  description,
  coachBrief,
  canWrite,
  workoutUnitSystem,
  blocks,
  syncKey,
  chrome,
  onApplyEdits,
  onSaveAndReturn,
  onReturn,
  saving,
  coreDirty,
  cuesByKey,
  cuesLoading = false,
  onAskCoachForCues,
  onCueSave,
  injuriesOnFile = false,
}: WorkoutBuilderGeneratedReviewProps) {
  const [mode, setMode] = useState<ReviewMode>('preview');
  const [draftBlocks, setDraftBlocks] = useState<WorkoutSessionBlockView[]>(() =>
    cloneWorkoutSessionBlocksForEditor(blocks),
  );

  const blocksContentKey = useMemo(() => workoutSessionBlocksContentKey(blocks), [blocks]);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  useEffect(() => {
    setMode('preview');
    setDraftBlocks(cloneWorkoutSessionBlocksForEditor(blocksRef.current));
  }, [syncKey, blocksContentKey]);

  const enterEdit = useCallback(() => {
    setDraftBlocks(cloneWorkoutSessionBlocksForEditor(blocks));
    setMode('edit');
  }, [blocks]);

  const cancelEdit = useCallback(() => {
    setDraftBlocks(cloneWorkoutSessionBlocksForEditor(blocks));
    setMode('preview');
  }, [blocks]);

  const applyEdits = useCallback(() => {
    onApplyEdits({
      title: title.trim(),
      description: description.trim(),
      exercises: [],
      blocks: draftBlocks,
    });
    setMode('preview');
  }, [onApplyEdits, title, description, draftBlocks]);

  const useRichBlockEdit = blocks.length > 0;
  const primaryActionLabel = saving
    ? 'Saving…'
    : coreDirty
      ? 'Save & Return to Board'
      : 'Return to Board';

  const handlePrimaryAction = useCallback(() => {
    if (coreDirty) {
      void onSaveAndReturn();
      return;
    }
    onReturn();
  }, [coreDirty, onSaveAndReturn, onReturn]);

  return (
    <div className="space-y-4" data-testid="workout-builder-generated-workout">
      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Generated workout</p>
          {useRichBlockEdit && canWrite ? (
            <div
              className="flex items-center gap-1 rounded-lg border border-border p-0.5"
              role="tablist"
              aria-label="Preview or edit generated workout"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'preview'}
                onClick={() => setMode('preview')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === 'preview'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'edit'}
                onClick={enterEdit}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === 'edit'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                Edit
              </button>
            </div>
          ) : null}
        </div>

        {mode === 'preview' && blocks.length > 0 ? (
          <div className="space-y-4">
            {coachBrief?.trim() ? <WorkoutCoachBriefSection brief={coachBrief} /> : null}
            <WorkoutBlockListRenderer
              blocks={blocks}
              taskId={taskId}
              density="full"
              chrome={chrome}
              data-testid="workout-builder-block-list"
              cuesByKey={cuesByKey}
              cuesLoading={cuesLoading}
              canWriteCue={canWrite}
              onAskCoachForCues={onAskCoachForCues}
              onCueSave={onCueSave}
              injuriesOnFile={injuriesOnFile}
            />
          </div>
        ) : mode === 'edit' && useRichBlockEdit ? (
          <div data-testid="workout-builder-block-editor">
            <WorkoutBlockListEditor
              blocks={draftBlocks}
              canWrite={canWrite}
              workoutUnitSystem={workoutUnitSystem}
              onChange={setDraftBlocks}
              idPrefix="builder-gen-block"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Workout generated — review exercises on the task card.
          </p>
        )}

        {mode === 'edit' && canWrite ? (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={applyEdits}>
              Apply changes
            </Button>
          </div>
        ) : null}
      </div>

      {mode === 'preview' ? (
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={saving || !canWrite}
          onClick={handlePrimaryAction}
        >
          {primaryActionLabel}
        </Button>
      ) : null}
    </div>
  );
}
