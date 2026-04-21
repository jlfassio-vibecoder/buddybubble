'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkoutExercisesEditor } from '@/components/fitness/workout-exercises-editor';
import { Button } from '@/components/ui/button';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { mergeWorkoutExercisesIntoTaskMetadata } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { usePersistDeckSnapshot } from '@/features/live-video/shells/huddle/usePersistDeckSnapshot';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { cn } from '@/lib/utils';
import { useUserProfileStore } from '@/store/userProfileStore';
import type { ItemType, UnitSystem } from '@/types/database';

export type LiveSessionWorkoutPlayerProps = {
  className?: string;
  workspaceId: string;
  supabase: SupabaseClient;
  canWrite: boolean;
  onPersistSuccess?: () => void;
};

function isWorkoutItemType(t: ItemType | string): boolean {
  return t === 'workout' || t === 'workout_log';
}

export function LiveSessionWorkoutPlayer({
  className,
  workspaceId,
  supabase,
  canWrite,
  onPersistSuccess,
}: LiveSessionWorkoutPlayerProps) {
  const ctx = useWorkoutDeckSelectionOptional();
  const profileId = useUserProfileStore((s) => s.profile?.id);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');

  const { busy, updateOriginalTask, insertTaskClone } = usePersistDeckSnapshot({
    supabase,
    canWrite,
    onSuccess: onPersistSuccess,
  });

  useEffect(() => {
    if (!profileId || !workspaceId) return;
    let cancelled = false;
    void supabase
      .from('fitness_profiles')
      .select('unit_system')
      .eq('workspace_id', workspaceId)
      .eq('user_id', profileId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        if (data?.unit_system === 'imperial' || data?.unit_system === 'metric') {
          setUnitSystem(data.unit_system as UnitSystem);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, supabase, workspaceId]);

  const activeSnapshot = useMemo(() => {
    if (!ctx?.deck.length) return null;
    const id = ctx.activeSnapshotId;
    if (id) {
      const found = ctx.deck.find((s) => s.snapshotId === id);
      if (found) return found;
    }
    return ctx.deck[0] ?? null;
  }, [ctx?.activeSnapshotId, ctx?.deck]);

  const onExercisesChange = useCallback(
    (next: WorkoutExercise[]) => {
      if (!ctx || !activeSnapshot) return;
      const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(activeSnapshot.task, next);
      ctx.updateSnapshotTask(activeSnapshot.snapshotId, {
        ...activeSnapshot.task,
        metadata: nextMeta,
      });
    },
    [activeSnapshot, ctx],
  );

  const handleApplySessionOnly = useCallback(() => {
    if (!ctx || !activeSnapshot?.dirty) return;
    ctx.acceptSnapshotSessionOnly(activeSnapshot.snapshotId);
  }, [activeSnapshot, ctx]);

  const handleUpdateOriginal = useCallback(async () => {
    if (!ctx || !activeSnapshot) return;
    const ok = await updateOriginalTask(activeSnapshot);
    if (ok) {
      ctx.acceptSnapshotSessionOnly(activeSnapshot.snapshotId);
    }
  }, [activeSnapshot, ctx, updateOriginalTask]);

  const handleSaveAsNew = useCallback(async () => {
    if (!ctx || !activeSnapshot) return;
    const newId = await insertTaskClone(activeSnapshot);
    if (newId) {
      ctx.rebindSnapshotOrigin(activeSnapshot.snapshotId, newId);
    }
  }, [activeSnapshot, ctx, insertTaskClone]);

  if (!ctx) return null;

  if (!activeSnapshot) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        Add workouts from the board, then select a card above to edit exercises.
      </div>
    );
  }

  if (!isWorkoutItemType(activeSnapshot.task.item_type)) {
    return (
      <div
        className={cn(
          'rounded-lg border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        Selected card is not a workout — exercise editing is only available for workout cards.
      </div>
    );
  }

  const exercises = metadataFieldsFromParsed(activeSnapshot.task.metadata).workoutExercises;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-hidden', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <WorkoutExercisesEditor
          key={activeSnapshot.snapshotId}
          idPrefix={`huddle-deck-${activeSnapshot.snapshotId}`}
          exercises={exercises}
          onChange={onExercisesChange}
          canWrite={canWrite}
          workoutUnitSystem={unitSystem}
        />
      </div>

      {activeSnapshot.dirty ? (
        <div className="shrink-0 space-y-2 rounded-lg border border-border bg-card p-3 shadow-sm">
          <p className="text-xs font-medium text-foreground">Unsaved exercise changes</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={busy}
              onClick={handleApplySessionOnly}
            >
              Apply to session only
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || !canWrite}
              onClick={() => void handleUpdateOriginal()}
            >
              Update original card
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !canWrite}
              onClick={() => void handleSaveAsNew()}
            >
              Save as new card
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
