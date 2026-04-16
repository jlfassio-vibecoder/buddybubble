'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import type { ItemType, Json, TaskVisibility } from '@/types/database';
import {
  buildTaskMetadataPayload,
  parseTaskMetadata,
  type ProgramWeek,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { postPersonalizeProgram } from '@/lib/workout-factory/api-client';
import { archiveDuplicateProgramsFromSameTemplate } from '@/lib/fitness/archive-duplicate-template-programs';
import { hasOtherActiveProgramForUserInWorkspace } from '@/lib/fitness/active-program-for-user';
import {
  resolveThirdKanbanStatusSlug,
  upsertProgramWorkoutTasks,
} from '@/lib/fitness/upsert-program-workout-tasks';
import { syncProgramLinkedWorkoutSchedules } from '@/lib/fitness/sync-program-workout-schedules';
import { formatUserFacingError } from '@/lib/format-error';
import {
  diffNewActivityEntries,
  insertTaskActivityLogEntries,
} from '@/lib/task-activity-log-persist';
import {
  appendActivityForFieldChange,
  asActivityLog,
  type TaskActivityEntry,
} from '@/types/task-modal';
import type { TaskModalOriginalSnapshot } from '@/components/modals/task-modal/task-modal-save-utils';

export type UseTaskProgramPersonalizationArgs = {
  canWrite: boolean;
  workspaceId: string;
  taskId: string | null;
  itemType: ItemType;
  programSourceTitle: string;
  title: string;
  programGoal: string;
  programDurationWeeks: string;
  programSchedule: ProgramWeek[];
  programCurrentWeek: number;
  visibility: TaskVisibility;
  metadata: Json;
  activityLog: TaskActivityEntry[];
  eventLocation: string;
  eventUrl: string;
  experienceSeason: string;
  experienceEndDate: string;
  memoryCaption: string;
  workoutType: string;
  workoutDurationMin: string;
  workoutExercises: WorkoutExercise[];
  cardCoverPath: string;
  defaultStatus: string;
  calendarTimezone: string | null;
  hasTodayBoardColumn: boolean;
  hasScheduledBoardColumn: boolean;
  originalRef: MutableRefObject<TaskModalOriginalSnapshot | null>;
  loadTask: (id: string) => Promise<void>;
  setActivityLog: Dispatch<SetStateAction<TaskActivityEntry[]>>;
};

export function useTaskProgramPersonalization({
  canWrite,
  workspaceId,
  taskId,
  itemType,
  programSourceTitle,
  title,
  programGoal,
  programDurationWeeks,
  programSchedule,
  programCurrentWeek,
  visibility,
  metadata,
  activityLog,
  eventLocation,
  eventUrl,
  experienceSeason,
  experienceEndDate,
  memoryCaption,
  workoutType,
  workoutDurationMin,
  workoutExercises,
  cardCoverPath,
  defaultStatus,
  calendarTimezone,
  hasTodayBoardColumn,
  hasScheduledBoardColumn,
  originalRef,
  loadTask,
  setActivityLog,
}: UseTaskProgramPersonalizationArgs) {
  const [aiProgramPersonalizing, setAiProgramPersonalizing] = useState(false);

  const handlePersonalizeProgram = useCallback(async () => {
    if (!canWrite || !workspaceId || itemType !== 'program' || !taskId) return;
    const baseTitle = programSourceTitle.trim() || title.trim();
    if (!baseTitle) {
      toast.error('Add a title before personalizing.');
      return;
    }
    const dw = parseInt(programDurationWeeks, 10);
    const durationWeeks = !Number.isNaN(dw) && dw > 0 ? dw : 0;
    if (durationWeeks < 1) {
      toast.error('Set a valid duration (weeks) before personalizing.');
      return;
    }
    setAiProgramPersonalizing(true);
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const uid = authUser?.id ?? null;
      if (!uid) {
        toast.error('Sign in to personalize.');
        return;
      }
      if (await hasOtherActiveProgramForUserInWorkspace(supabase, workspaceId, uid, taskId)) {
        toast.error('You already have an active program. Please complete or pause it first.');
        return;
      }

      const data = await postPersonalizeProgram({
        workspace_id: workspaceId,
        program: {
          base_title: baseTitle,
          goal: programGoal.trim(),
          duration_weeks: durationWeeks,
          schedule: programSchedule,
        },
      });
      const nextTitle = `${baseTitle} - ${data.title_suffix}`;
      const { slug: statusSlug, usedFallback } = await resolveThirdKanbanStatusSlug(
        supabase,
        workspaceId,
        defaultStatus,
      );
      if (usedFallback) {
        toast.warning(
          'This board has fewer than three columns; linked workouts were placed in the first column instead.',
        );
      }
      const up = await upsertProgramWorkoutTasks({
        supabase,
        workspaceId,
        programTaskId: taskId,
        sessions: data.sessions,
        statusSlug,
        visibility,
      });
      if (up.error) {
        toast.error(up.error);
        return;
      }

      const metaPayload = buildTaskMetadataPayload(
        'program',
        {
          eventLocation,
          eventUrl,
          experienceSeason,
          experienceEndDate,
          memoryCaption,
          workoutType,
          workoutDurationMin,
          workoutExercises,
          programGoal,
          programDurationWeeks,
          programCurrentWeek,
          programSchedule,
          programSourceTitle: baseTitle,
          cardCoverPath,
        },
        {
          ...(parseTaskMetadata(metadata) as Record<string, unknown>),
          ai_program_personalization: {
            generated_at: new Date().toISOString(),
            model: data.model_used,
          },
        },
      );

      const orig = originalRef.current;
      let nextActivity = [...activityLog];
      const nextDesc = (data.description ?? '').trim();
      if (orig) {
        if (nextTitle !== orig.title) {
          nextActivity = appendActivityForFieldChange(nextActivity, {
            userId: uid,
            field: 'title',
            from: orig.title,
            to: nextTitle,
          });
        }
        if (nextDesc !== (orig.description ?? '').trim()) {
          nextActivity = appendActivityForFieldChange(nextActivity, {
            userId: uid,
            field: 'description',
            from: orig.description ?? '',
            to: nextDesc,
          });
        }
      }

      const { data: taskRow, error: rowErr } = await supabase
        .from('tasks')
        .select('bubble_id')
        .eq('id', taskId)
        .maybeSingle();

      if (rowErr || !taskRow) {
        toast.error(rowErr?.message ?? 'Could not load task.');
        return;
      }

      const { error: updErr } = await supabase
        .from('tasks')
        .update({
          title: nextTitle,
          description: nextDesc || null,
          metadata: metaPayload,
        })
        .eq('id', taskId);

      if (updErr) {
        toast.error(formatUserFacingError(updErr));
        return;
      }

      const actDelta = diffNewActivityEntries(activityLog, nextActivity);
      const { error: actErr } = await insertTaskActivityLogEntries(supabase, taskId, actDelta);
      if (actErr) {
        console.warn(
          '[useTaskProgramPersonalization] task_activity_log insert failed',
          actErr.message,
        );
      }

      const syncSched = await syncProgramLinkedWorkoutSchedules({
        supabase,
        programTaskId: taskId,
        calendarTimezone,
        hasTodayBoardColumn,
        hasScheduledBoardColumn,
      });
      if (syncSched.error) {
        toast.error(syncSched.error);
        return;
      }

      const srcId = (metaPayload as Record<string, unknown>).source_template_id;
      if (typeof srcId === 'string' && taskRow.bubble_id) {
        const { error: archErr } = await archiveDuplicateProgramsFromSameTemplate({
          supabase,
          bubbleId: taskRow.bubble_id as string,
          keepProgramTaskId: taskId,
          sourceTemplateId: srcId,
        });
        if (archErr) {
          toast.error(archErr);
        }
      }

      setActivityLog(asActivityLog(nextActivity));
      void loadTask(taskId);
      toast.success('Program personalized.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Personalization failed');
    } finally {
      setAiProgramPersonalizing(false);
    }
  }, [
    canWrite,
    workspaceId,
    itemType,
    taskId,
    programSourceTitle,
    title,
    programGoal,
    programDurationWeeks,
    programSchedule,
    defaultStatus,
    visibility,
    eventLocation,
    eventUrl,
    experienceSeason,
    experienceEndDate,
    memoryCaption,
    workoutType,
    workoutDurationMin,
    workoutExercises,
    programCurrentWeek,
    metadata,
    activityLog,
    loadTask,
    calendarTimezone,
    hasTodayBoardColumn,
    hasScheduledBoardColumn,
    cardCoverPath,
    originalRef,
    setActivityLog,
  ]);

  return { aiProgramPersonalizing, handlePersonalizeProgram };
}
