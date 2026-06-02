'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TaskRow } from '@/types/database';
import { EmomDurationSettings } from '@/features/live-video/shells/huddle/emom-builder/EmomDurationSettings';
import { EmomStationBuilder } from '@/features/live-video/shells/huddle/emom-builder/EmomStationBuilder';
import {
  hydrateEmomAuthoringDraft,
  type EmomAuthoringDraft,
} from '@/lib/workout-factory/emom-authoring';
import {
  emomBlockExerciseOptions,
  findEmomMainBlock,
  patchEmomBlockMetadata,
} from '@/lib/workout-factory/patch-emom-block-metadata';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { cn } from '@/lib/utils';

export type EmomBlockEditorProps = {
  task: TaskRow;
  canWrite: boolean;
  onCommit: (nextMetadata: TaskRow['metadata']) => void;
  className?: string;
};

export function EmomBlockEditor({ task, canWrite, onCommit, className }: EmomBlockEditorProps) {
  const vm = useMemo(() => buildWorkoutSessionViewModel(task.metadata), [task.metadata]);
  const emomBlock = useMemo(() => findEmomMainBlock(vm.blocks), [vm.blocks]);
  const exerciseOptions = useMemo(() => emomBlockExerciseOptions(vm.blocks), [vm.blocks]);
  const exerciseCount = emomBlock?.exercises?.length ?? 0;

  const formatParamsKey = useMemo(
    () => JSON.stringify(emomBlock?.formatParams ?? {}),
    [emomBlock?.formatParams],
  );

  const [draft, setDraft] = useState<EmomAuthoringDraft>(() =>
    hydrateEmomAuthoringDraft(emomBlock?.formatParams ?? {}, exerciseCount),
  );

  useEffect(() => {
    setDraft(hydrateEmomAuthoringDraft(emomBlock?.formatParams ?? {}, exerciseCount));
  }, [task.metadata, formatParamsKey, exerciseCount, emomBlock?.formatParams]);

  const commitDraft = useCallback(
    (next: EmomAuthoringDraft) => {
      setDraft(next);
      if (!canWrite) return;
      const nextMeta = patchEmomBlockMetadata(task, next);
      onCommit(nextMeta);
    },
    [canWrite, onCommit, task],
  );

  const hasRestInCycle = draft.stations.some((s) => s.is_rest);

  if (!emomBlock) return null;

  return (
    <div className={cn('space-y-3', className)} data-region="emom-block-editor">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        EMOM setup
      </p>
      <EmomDurationSettings
        totalMinutes={draft.total_minutes}
        trackActivePacing={draft.track_active_pacing}
        canWrite={canWrite}
        onTotalMinutesChange={(total_minutes) => commitDraft({ ...draft, total_minutes })}
        onTrackActivePacingChange={(track_active_pacing) =>
          commitDraft({ ...draft, track_active_pacing })
        }
      />
      <EmomStationBuilder
        stations={draft.stations}
        exerciseOptions={exerciseOptions}
        totalMinutes={draft.total_minutes}
        canWrite={canWrite}
        hasRestInCycle={hasRestInCycle}
        onStationsChange={(stations) => commitDraft({ ...draft, stations })}
      />
    </div>
  );
}
