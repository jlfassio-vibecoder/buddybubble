import { fromPromise } from 'xstate';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildWorkoutLogExercisePayloadFromLogs,
  buildWorkoutLogFinishMetadata,
} from '@/lib/workout-factory/build-workout-log-finish-metadata';
import { mergeLastPerformedAtIntoTaskMetadata } from '@/lib/workout-factory/merge-last-performed-at';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';
import type { Json } from '@/types/database';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import type { ActiveSessionContext } from '../machines/types';
import type { PersistenceAdapter } from './persistence.actor';

export type FinishWorkoutResult = {
  logTaskId: string;
  op: 'finish_insert' | 'finish_update';
};

export type FinishWorkoutRunner = (context: ActiveSessionContext) => Promise<FinishWorkoutResult>;

export type FinishWorkoutInput = {
  context: ActiveSessionContext;
  finishWorkoutRunner: FinishWorkoutRunner;
};

export type ProductionFinishWorkoutDeps = {
  supabase: SupabaseClient;
  sourceMetadata: Json | null;
  sessionVm: WorkoutSessionViewModel;
  workoutTitle: string;
};

type SourceTaskRow = {
  metadata: Json | null;
  program_id: string | null;
  program_session_key: string | null;
  scheduled_on: string | null;
  scheduled_time: string | null;
  visibility: string | null;
  task_assignees?: { user_id: string }[] | null;
};

type SourceProgramFieldsRow = Pick<
  SourceTaskRow,
  'program_id' | 'program_session_key' | 'scheduled_on' | 'scheduled_time' | 'visibility'
>;

function programFieldsFromSource(sourceRow: SourceProgramFieldsRow | null) {
  if (!sourceRow) return {};
  return {
    ...(sourceRow.program_id != null ? { program_id: sourceRow.program_id } : {}),
    ...(sourceRow.program_session_key != null
      ? { program_session_key: sourceRow.program_session_key }
      : {}),
    ...(sourceRow.scheduled_on != null ? { scheduled_on: sourceRow.scheduled_on } : {}),
    ...(sourceRow.scheduled_time != null ? { scheduled_time: sourceRow.scheduled_time } : {}),
    ...(sourceRow.visibility != null ? { visibility: sourceRow.visibility } : {}),
  } as const;
}

export function createProductionFinishWorkoutRunner(
  deps: ProductionFinishWorkoutDeps,
): FinishWorkoutRunner {
  return async (context) => executeFinishWorkout(context, deps);
}

/** Test helper — mirrors Phase 0 stub via draft adapter insert/update. */
export function createAdapterFinishWorkoutRunner(adapter: PersistenceAdapter): FinishWorkoutRunner {
  return async (context) => {
    if (context.logTaskId != null) {
      await adapter.updateDraft(context.logTaskId);
      return { logTaskId: context.logTaskId, op: 'finish_update' };
    }
    const { logTaskId } = await adapter.insertDraft();
    return { logTaskId, op: 'finish_insert' };
  };
}

export async function executeFinishWorkout(
  context: ActiveSessionContext,
  deps: ProductionFinishWorkoutDeps,
): Promise<FinishWorkoutResult> {
  const { supabase, sourceMetadata, sessionVm, workoutTitle } = deps;

  const exercisePayload = buildWorkoutLogExercisePayloadFromLogs(
    sessionVm.flatExercises,
    context.draftLogs,
  );

  const durationMin = Math.max(1, Math.round(context.elapsedSec / 60));
  const finalMetadata = buildWorkoutLogFinishMetadata({
    sourceMetadata,
    sessionVm,
    exercises: exercisePayload,
    durationMin,
    sourceTaskId: context.sourceTaskId,
    classInstanceId: context.classInstanceId ?? null,
  });

  let sourceRow: SourceProgramFieldsRow | null = null;
  let sourceAssigneeUserIds: string[] = [];

  const { data: fetched, error: sourceTaskError } = await supabase
    .from('tasks')
    .select(
      'metadata, program_id, program_session_key, scheduled_on, scheduled_time, visibility, task_assignees(user_id)',
    )
    .eq('id', context.sourceTaskId)
    .maybeSingle();

  if (sourceTaskError) {
    throw sourceTaskError;
  }

  if (fetched) {
    const f = fetched as SourceTaskRow;
    sourceRow = {
      program_id: f.program_id,
      program_session_key: f.program_session_key,
      scheduled_on: f.scheduled_on,
      scheduled_time: f.scheduled_time,
      visibility: f.visibility,
    };
    sourceAssigneeUserIds = [
      ...new Set(
        (f.task_assignees ?? [])
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id?.trim())),
      ),
    ];
  }

  const performedAt = new Date().toISOString();
  const sourceMetadataForPatch = fetched != null ? (fetched as SourceTaskRow).metadata : null;

  const syncAssignees = async (taskId: string) => {
    if (sourceAssigneeUserIds.length === 0) return;
    const { error: syncErr } = await replaceTaskAssigneesWithUserIds(
      supabase,
      taskId,
      sourceAssigneeUserIds,
    );
    if (syncErr) {
      throw new Error(syncErr);
    }
  };

  const patchSourceTemplateLastPerformed = async () => {
    const mergedMetadata = mergeLastPerformedAtIntoTaskMetadata(
      sourceMetadataForPatch,
      performedAt,
    );
    const { error: templateMetaError } = await supabase
      .from('tasks')
      .update({ metadata: mergedMetadata as Json })
      .eq('id', context.sourceTaskId)
      .eq('item_type', 'workout');

    if (templateMetaError) {
      throw templateMetaError;
    }
  };

  const programFields = programFieldsFromSource(sourceRow);
  const finalLogId = context.logTaskId;

  const supersedeStaleInProgressLogs = async (finishedLogId: string) => {
    const { error: staleError } = await supabase
      .from('tasks')
      .delete()
      .eq('bubble_id', context.targetBubbleId)
      .eq('item_type', 'workout_log')
      .eq('status', 'in_progress')
      .eq('metadata->>source_task_id', context.sourceTaskId)
      .neq('id', finishedLogId);

    if (staleError) {
      throw staleError;
    }
  };

  if (finalLogId) {
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        ...programFields,
        metadata: finalMetadata,
      })
      .eq('id', finalLogId);

    if (updateError) {
      throw updateError;
    }

    await syncAssignees(finalLogId);
    await patchSourceTemplateLastPerformed();
    await supersedeStaleInProgressLogs(finalLogId);
    return { logTaskId: finalLogId, op: 'finish_update' };
  }

  const { data: insertedLog, error: insertError } = await supabase
    .from('tasks')
    .insert({
      bubble_id: context.targetBubbleId,
      title: `${workoutTitle} — Log`,
      item_type: 'workout_log',
      status: 'completed',
      ...programFields,
      metadata: finalMetadata,
    })
    .select('id')
    .maybeSingle();

  if (insertError || !insertedLog?.id) {
    throw insertError ?? new Error('finish_insert_failed');
  }

  await syncAssignees(insertedLog.id);
  await patchSourceTemplateLastPerformed();
  await supersedeStaleInProgressLogs(insertedLog.id);
  return { logTaskId: insertedLog.id, op: 'finish_insert' };
}

export const finishWorkoutActor = fromPromise<FinishWorkoutResult, FinishWorkoutInput>(
  async ({ input }) => input.finishWorkoutRunner(input.context),
);
