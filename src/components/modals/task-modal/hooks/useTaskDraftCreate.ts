'use client';

import { createClient } from '@utils/supabase/client';
import type { ItemType, TaskRow } from '@/types/database';
import {
  buildTaskMetadataPayload,
  type ProgramWeek,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { mergeJsonWithLiveSessionToggle } from '@/lib/card-live-session-metadata';
import { formatUserFacingError } from '@/lib/format-error';
import {
  computeEffectiveStatusForSchedule,
  parseCreateScheduleInputs,
} from '@/components/modals/task-modal/task-modal-save-utils';
import {
  insertTasksRowWithRetries,
  resolveInsertPosition,
  type TasksInsertRow,
} from '@/components/modals/task-modal/task-insert-row';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';
import type { TaskDraftBaseline } from '@/components/modals/task-modal/task-draft-types';

export type CreateDraftTaskArgs = {
  bubbleId: string;
  workspaceId: string;
  itemType: ItemType;
  /** Kanban column slug when creating from a column header. */
  statusSlug?: string | null;
  /** Optional title; defaults to `Untitled` when empty. */
  title?: string | null;
  workoutDurationMin?: string | null;
  calendarTimezone: string | null;
  hasTodayBoardColumn: boolean;
  hasScheduledBoardColumn: boolean;
};

export type CreateDraftTaskResult =
  | { ok: true; id: string; baseline: TaskDraftBaseline }
  | { ok: false; error: Error };

function emptyMetadataFormFields(workoutDurationMin: string) {
  return {
    eventLocation: '',
    eventUrl: '',
    eventBring: [] as string[],
    eventGoing: '',
    eventCapacity: '',
    eventGoingPeople: [] as string[],
    experienceSeason: '',
    experienceEndDate: '',
    experienceHighlights: [] as string[],
    experienceIncludes: [] as string[],
    experienceGoodFor: [] as string[],
    experienceLocation: '',
    experienceDurationMin: '',
    experiencePrice: '',
    experienceGroupMin: '',
    experienceGroupMax: '',
    memoryCaption: '',
    workoutType: '',
    workoutDurationMin,
    workoutExercises: [] as WorkoutExercise[],
    programGoal: '',
    programDurationWeeks: '',
    programCurrentWeek: 0,
    programSchedule: [] as ProgramWeek[],
    programSourceTitle: '',
    cardCoverPath: '',
  };
}

function baselineFromInsertRow(
  insertRow: TasksInsertRow,
  scheduledOnInput: string,
  scheduledTimeInput: string,
): TaskDraftBaseline {
  return {
    title: insertRow.title,
    description: insertRow.description,
    metadataJson: JSON.stringify(insertRow.metadata),
    priority: insertRow.priority,
    visibility: insertRow.visibility,
    status: insertRow.status,
    position: insertRow.position,
    scheduledOn: scheduledOnInput,
    scheduledTime: scheduledTimeInput,
    attachmentsJson: '[]',
    subtasksJson: '[]',
  };
}

/**
 * Optimistic `tasks` insert for Phase 3.8 — opens TaskModal with a real `taskId` so
 * `StandardTaskChatRail` can mount on frame 1.
 */
export async function createDraftTask(args: CreateDraftTaskArgs): Promise<CreateDraftTaskResult> {
  const supabase = createClient();
  const {
    data: { user: authUser },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !authUser?.id) {
    return {
      ok: false,
      error: new Error(
        formatUserFacingError(
          authErr instanceof Error ? authErr : new Error('You must be signed in to create a task.'),
        ),
      ),
    };
  }

  const itemType = args.itemType;
  const durationStr =
    (itemType === 'workout' || itemType === 'workout_log') &&
    args.workoutDurationMin != null &&
    args.workoutDurationMin !== ''
      ? args.workoutDurationMin
      : '';

  const mergedMetadata = mergeJsonWithLiveSessionToggle(
    buildTaskMetadataPayload(itemType, emptyMetadataFormFields(durationStr), {}),
    {
      enabled: false,
      workspaceId: args.workspaceId,
      hostUserId: authUser.id,
    },
  ) as TaskRow['metadata'];

  const rawStatus = args.statusSlug?.trim() || 'todo';
  const { sched, scheduledTimeInsert } = parseCreateScheduleInputs('', '');
  const effectiveStatus = computeEffectiveStatusForSchedule({
    currentStatus: rawStatus,
    scheduledOnYmd: sched,
    calendarTimezone: args.calendarTimezone,
    hasTodayBoardColumn: args.hasTodayBoardColumn,
    hasScheduledBoardColumn: args.hasScheduledBoardColumn,
    itemType,
  });

  const maxPos = await resolveInsertPosition(supabase, args.bubbleId);
  const title = args.title?.trim() || 'Untitled';

  const insertRow: TasksInsertRow = {
    bubble_id: args.bubbleId,
    title,
    description: null,
    status: effectiveStatus,
    priority: 'medium',
    position: maxPos,
    scheduled_on: sched,
    item_type: itemType,
    metadata: mergedMetadata,
    visibility: 'private',
    created_by: authUser.id,
    ...(sched ? { scheduled_time: scheduledTimeInsert } : {}),
  };

  const { data, error: cErr } = await insertTasksRowWithRetries(supabase, insertRow, {
    status: rawStatus,
    calendarTimezone: args.calendarTimezone,
    hasTodayBoardColumn: args.hasTodayBoardColumn,
  });

  if (cErr || !data?.id) {
    return {
      ok: false,
      error: new Error(formatUserFacingError(cErr ?? new Error('Create draft failed'))),
    };
  }

  const newTaskId = data.id;
  const { error: assigneeErr } = await replaceTaskAssigneesWithUserIds(supabase, newTaskId, []);
  if (assigneeErr) {
    console.warn('[createDraftTask] task_assignees sync after draft create failed', assigneeErr);
  }

  const baseline = baselineFromInsertRow(insertRow, '', '');
  return { ok: true, id: newTaskId, baseline };
}
