'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import type { ItemType, Json, TaskRow } from '@/types/database';
import type { TaskPriority } from '@/lib/task-priority';
import type { TaskVisibility } from '@/types/database';
import { asActivityLog } from '@/types/task-modal';
import { formatUserFacingError } from '@/lib/format-error';
import { archiveOpenChildWorkoutsForProgram } from '@/lib/fitness/archive-program-child-workouts';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import {
  buildActivityLogForCoreFieldChanges,
  computeEffectiveStatusForSchedule,
  computeSchedulePatchFlags,
  computeStatusWhenCreateScheduledDateUnsupported,
  computeStatusWhenUpdateScheduledDateUnsupported,
  parseCreateScheduleInputs,
  parseScheduledDateFromInput,
  parseTimeHmFromScheduledInputs,
  toPgScheduledTime,
  type TaskModalOriginalSnapshot,
} from '@/components/modals/task-modal/task-modal-save-utils';
export type UseTaskSaveAndCreateArgs = {
  canWrite: boolean;
  taskId: string | null;
  bubbleId: string | null;
  workspaceId: string;
  loadTask: (id: string) => void | Promise<void>;
  onCreated?: (newTaskId: string) => void;
  onOpenChange: (open: boolean) => void;
  onTaskArchived?: () => void;
  title: string;
  description: string;
  status: string;
  priority: TaskPriority;
  scheduledOn: string;
  scheduledTime: string;
  itemType: ItemType;
  visibility: TaskVisibility;
  assignedTo: string | null;
  metadataForSave: Json;
  boardColumnDefs: { id: string; label: string }[] | null;
  hasTodayBoardColumn: boolean;
  hasScheduledBoardColumn: boolean;
  calendarTimezone: string | null;
  activityLog: import('@/types/task-modal').TaskActivityEntry[];
  setActivityLog: Dispatch<SetStateAction<import('@/types/task-modal').TaskActivityEntry[]>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setPriority: Dispatch<SetStateAction<TaskPriority>>;
  setScheduledOn: Dispatch<SetStateAction<string>>;
  setScheduledTime: Dispatch<SetStateAction<string>>;
  setVisibility: Dispatch<SetStateAction<TaskVisibility>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  originalRef: MutableRefObject<TaskModalOriginalSnapshot | null>;
  setOriginalFromAppliedRow: (snapshot: TaskModalOriginalSnapshot) => void;
};

export function useTaskSaveAndCreate({
  canWrite,
  taskId,
  bubbleId,
  workspaceId,
  loadTask,
  onCreated,
  onOpenChange,
  onTaskArchived,
  title,
  description,
  status,
  priority,
  scheduledOn,
  scheduledTime,
  itemType,
  visibility,
  assignedTo,
  metadataForSave,
  boardColumnDefs,
  hasTodayBoardColumn,
  hasScheduledBoardColumn,
  calendarTimezone,
  activityLog,
  setActivityLog,
  setStatus,
  setPriority,
  setScheduledOn,
  setScheduledTime,
  setVisibility,
  setError,
  setSaving,
  originalRef,
  setOriginalFromAppliedRow,
}: UseTaskSaveAndCreateArgs) {
  const [archiving, setArchiving] = useState(false);

  const archiveTask = useCallback(async () => {
    if (!taskId || !canWrite || archiving) return;
    setArchiving(true);
    setError(null);
    const supabase = createClient();
    const { error: uErr } = await supabase
      .from('tasks')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', taskId);
    setArchiving(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    if (itemType === 'program') {
      const { error: childErr } = await archiveOpenChildWorkoutsForProgram(supabase, taskId);
      if (childErr) {
        toast.error(childErr);
      }
    }
    onOpenChange(false);
    onTaskArchived?.();
  }, [archiving, canWrite, itemType, onOpenChange, onTaskArchived, setError, taskId]);

  const saveCoreFields = useCallback(async () => {
    if (!canWrite || !taskId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id ?? null;

    const orig = originalRef.current;
    const scheduledOnValue = parseScheduledDateFromInput(scheduledOn);
    const newTimeHm = parseTimeHmFromScheduledInputs(scheduledOnValue, scheduledTime);
    const scheduledTimePg = toPgScheduledTime(newTimeHm);
    const { schedChanged, schedTimeChanged } = computeSchedulePatchFlags(
      orig,
      scheduledOnValue,
      newTimeHm,
    );
    const effectiveStatus = computeEffectiveStatusForSchedule({
      currentStatus: status,
      scheduledOnYmd: scheduledOnValue,
      calendarTimezone,
      hasTodayBoardColumn,
      hasScheduledBoardColumn,
      itemType,
    });

    const typeMetaPatch = {
      item_type: itemType,
      metadata: metadataForSave as TaskRow['metadata'],
    };

    const nextActivity = buildActivityLogForCoreFieldChanges({
      orig,
      activityLog,
      uid,
      titleTrimmed: title.trim(),
      description,
      effectiveStatus,
      priority,
      visibility,
      scheduledOnValue,
      newTimeHm,
      assignedTo,
    });

    const updateWithPriority = {
      title: title.trim(),
      description: description.trim() || null,
      status: effectiveStatus,
      priority,
      visibility,
      assigned_to: assignedTo,
      ...typeMetaPatch,
      ...(schedChanged ? { scheduled_on: scheduledOnValue } : {}),
      ...(schedTimeChanged ? { scheduled_time: scheduledTimePg } : {}),
      activity_log: nextActivity as unknown as TaskRow['activity_log'],
    };

    let { error: uErr } = await supabase.from('tasks').update(updateWithPriority).eq('id', taskId);

    if (uErr && isMissingColumnSchemaCacheError(uErr, 'scheduled_time')) {
      const activityWithoutTime = nextActivity.filter(
        (e) => !(e.type === 'field_change' && e.field === 'scheduled_time'),
      );
      const updateNoTime = {
        title: title.trim(),
        description: description.trim() || null,
        status: effectiveStatus,
        priority,
        visibility,
        assigned_to: assignedTo,
        ...typeMetaPatch,
        ...(schedChanged ? { scheduled_on: scheduledOnValue } : {}),
        activity_log: activityWithoutTime as unknown as TaskRow['activity_log'],
      };
      uErr = (await supabase.from('tasks').update(updateNoTime).eq('id', taskId)).error;
      if (!uErr) {
        if (orig && schedTimeChanged) {
          setScheduledTime(orig.scheduledTime ? `${orig.scheduledTime}` : '');
          setError(
            'Scheduled time is not saved yet: apply the scheduled-time migration on Supabase (tasks.scheduled_time), then try again.',
          );
        }
        setActivityLog(asActivityLog(activityWithoutTime));
        setStatus(effectiveStatus);
        setOriginalFromAppliedRow({
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority,
          scheduledOn: schedChanged ? scheduledOnValue : (orig?.scheduledOn ?? null),
          scheduledTime: orig?.scheduledTime ?? null,
          itemType,
          metadataJson: JSON.stringify(metadataForSave),
          visibility,
          assignedTo,
        });
        setSaving(false);
        void loadTask(taskId);
        return;
      }
    }

    if (uErr && isMissingColumnSchemaCacheError(uErr, 'scheduled_on')) {
      const activityWithoutSched = nextActivity.filter(
        (e) =>
          !(
            e.type === 'field_change' &&
            (e.field === 'scheduled_on' || e.field === 'scheduled_time')
          ),
      );
      const statusWithoutSavedSchedule = computeStatusWhenUpdateScheduledDateUnsupported({
        currentStatus: status,
        persistedScheduledOnYmd: orig?.scheduledOn ?? null,
        calendarTimezone,
        hasTodayBoardColumn,
      });
      const updateNoSched = {
        title: title.trim(),
        description: description.trim() || null,
        status: statusWithoutSavedSchedule,
        priority,
        visibility,
        assigned_to: assignedTo,
        ...typeMetaPatch,
        activity_log: activityWithoutSched as unknown as TaskRow['activity_log'],
      };
      uErr = (await supabase.from('tasks').update(updateNoSched).eq('id', taskId)).error;
      if (!uErr) {
        if (orig && scheduledOnValue !== orig.scheduledOn) {
          setScheduledOn(orig.scheduledOn ?? '');
          setScheduledTime(orig.scheduledTime ? `${orig.scheduledTime}` : '');
          setError(
            'Scheduled date is not saved yet: apply the scheduled-dates migration on Supabase (tasks.scheduled_on), then try again.',
          );
        }
        setActivityLog(asActivityLog(activityWithoutSched));
        setStatus(statusWithoutSavedSchedule);
        setOriginalFromAppliedRow({
          title: title.trim(),
          description: description.trim(),
          status: statusWithoutSavedSchedule,
          priority,
          scheduledOn: orig?.scheduledOn ?? null,
          scheduledTime: orig?.scheduledTime ?? null,
          itemType,
          metadataJson: JSON.stringify(metadataForSave),
          visibility,
          assignedTo,
        });
        setSaving(false);
        void loadTask(taskId);
        return;
      }
    }

    if (uErr && isMissingColumnSchemaCacheError(uErr, 'priority')) {
      const activityWithoutPriority = nextActivity.filter(
        (e) => !(e.type === 'field_change' && e.field === 'priority'),
      );
      const revertedPriority = orig?.priority ?? 'medium';
      const updateWithoutPriority = {
        title: title.trim(),
        description: description.trim() || null,
        status: effectiveStatus,
        visibility,
        assigned_to: assignedTo,
        ...typeMetaPatch,
        ...(schedChanged ? { scheduled_on: scheduledOnValue } : {}),
        ...(schedTimeChanged ? { scheduled_time: scheduledTimePg } : {}),
        activity_log: activityWithoutPriority as unknown as TaskRow['activity_log'],
      };
      uErr = (await supabase.from('tasks').update(updateWithoutPriority).eq('id', taskId)).error;
      if (!uErr) {
        if (orig && priority !== orig.priority) setPriority(revertedPriority);
        setActivityLog(asActivityLog(activityWithoutPriority));
        setStatus(effectiveStatus);
        setOriginalFromAppliedRow({
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority: revertedPriority,
          scheduledOn: scheduledOnValue,
          scheduledTime: newTimeHm,
          itemType,
          metadataJson: JSON.stringify(metadataForSave),
          visibility: orig?.visibility ?? visibility,
          assignedTo: orig?.assignedTo ?? assignedTo,
        });
        setSaving(false);
        void loadTask(taskId);
        return;
      }
    }

    if (uErr && isMissingColumnSchemaCacheError(uErr, 'visibility')) {
      const activityWithoutVisibility = nextActivity.filter(
        (e) => !(e.type === 'field_change' && e.field === 'visibility'),
      );
      const updateWithoutVisibility = {
        title: title.trim(),
        description: description.trim() || null,
        status: effectiveStatus,
        priority,
        assigned_to: assignedTo,
        ...typeMetaPatch,
        ...(schedChanged ? { scheduled_on: scheduledOnValue } : {}),
        ...(schedTimeChanged ? { scheduled_time: scheduledTimePg } : {}),
        activity_log: activityWithoutVisibility as unknown as TaskRow['activity_log'],
      };
      uErr = (await supabase.from('tasks').update(updateWithoutVisibility).eq('id', taskId)).error;
      if (!uErr) {
        if (orig && visibility !== orig.visibility) setVisibility(orig.visibility);
        setActivityLog(asActivityLog(activityWithoutVisibility));
        setStatus(effectiveStatus);
        setOriginalFromAppliedRow({
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority,
          scheduledOn: scheduledOnValue,
          scheduledTime: newTimeHm,
          itemType,
          metadataJson: JSON.stringify(metadataForSave),
          visibility: orig?.visibility ?? 'private',
          assignedTo: orig?.assignedTo ?? assignedTo,
        });
        setSaving(false);
        setError(
          'Visibility is not saved yet: apply the public-portals migration on Supabase (tasks.visibility), then try again.',
        );
        void loadTask(taskId);
        return;
      }
    }

    setSaving(false);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      return;
    }
    if (
      itemType === 'program' &&
      orig &&
      !taskColumnIsCompletionStatus(orig.status ?? '', boardColumnDefs) &&
      taskColumnIsCompletionStatus(effectiveStatus, boardColumnDefs)
    ) {
      const { error: childErr } = await archiveOpenChildWorkoutsForProgram(supabase, taskId);
      if (childErr) {
        toast.error(childErr);
      }
    }
    setActivityLog(asActivityLog(nextActivity));
    setStatus(effectiveStatus);
    setOriginalFromAppliedRow({
      title: title.trim(),
      description: description.trim(),
      status: effectiveStatus,
      priority,
      scheduledOn: scheduledOnValue,
      scheduledTime: newTimeHm,
      itemType,
      metadataJson: JSON.stringify(metadataForSave),
      visibility,
      assignedTo,
    });
    void loadTask(taskId);
  }, [
    activityLog,
    assignedTo,
    boardColumnDefs,
    calendarTimezone,
    canWrite,
    description,
    hasScheduledBoardColumn,
    hasTodayBoardColumn,
    itemType,
    loadTask,
    metadataForSave,
    originalRef,
    priority,
    scheduledOn,
    scheduledTime,
    setActivityLog,
    setError,
    setOriginalFromAppliedRow,
    setPriority,
    setSaving,
    setScheduledOn,
    setScheduledTime,
    setStatus,
    setVisibility,
    status,
    taskId,
    title,
    visibility,
  ]);

  const createTask = useCallback(async () => {
    if (!canWrite || !bubbleId || !title.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: existing } = await supabase
      .from('tasks')
      .select('position')
      .eq('bubble_id', bubbleId)
      .order('position', { ascending: false })
      .limit(1);
    const maxPos =
      existing && existing.length > 0
        ? Number((existing[0] as { position: number }).position) + 1
        : 0;

    const { sched, scheduledTimeInsert } = parseCreateScheduleInputs(scheduledOn, scheduledTime);
    const effectiveStatus = computeEffectiveStatusForSchedule({
      currentStatus: status,
      scheduledOnYmd: sched,
      calendarTimezone,
      hasTodayBoardColumn,
      hasScheduledBoardColumn,
      itemType,
    });

    const insertRow = {
      bubble_id: bubbleId,
      title: title.trim(),
      description: description.trim() || null,
      status: effectiveStatus,
      priority,
      position: maxPos,
      scheduled_on: sched,
      item_type: itemType,
      metadata: metadataForSave as TaskRow['metadata'],
      visibility,
      assigned_to: assignedTo,
      ...(sched ? { scheduled_time: scheduledTimeInsert } : {}),
    };

    let { data, error: cErr } = await supabase
      .from('tasks')
      .insert(insertRow)
      .select()
      .maybeSingle();

    if (cErr && isMissingColumnSchemaCacheError(cErr, 'scheduled_on')) {
      const { scheduled_on: _s, scheduled_time: _t, ...insertNoSched } = insertRow;
      const statusWithoutPersistedSchedule = computeStatusWhenCreateScheduledDateUnsupported({
        currentStatus: status,
        calendarTimezone,
        hasTodayBoardColumn,
      });
      const retry = await supabase
        .from('tasks')
        .insert({ ...insertNoSched, status: statusWithoutPersistedSchedule })
        .select()
        .maybeSingle();
      data = retry.data;
      cErr = retry.error;
    }

    if (cErr && isMissingColumnSchemaCacheError(cErr, 'scheduled_time')) {
      const { scheduled_time: _st, ...insertNoTime } = insertRow as typeof insertRow & {
        scheduled_time?: string | null;
      };
      const retry = await supabase.from('tasks').insert(insertNoTime).select().maybeSingle();
      data = retry.data;
      cErr = retry.error;
    }

    if (cErr && isMissingColumnSchemaCacheError(cErr, 'priority')) {
      const { priority: _p, ...insertWithoutPriority } = insertRow;
      const second = await supabase
        .from('tasks')
        .insert(insertWithoutPriority)
        .select()
        .maybeSingle();
      data = second.data;
      cErr = second.error;
    }

    if (cErr && isMissingColumnSchemaCacheError(cErr, 'visibility')) {
      const { visibility: _v, ...insertWithoutVisibility } = insertRow;
      const second = await supabase
        .from('tasks')
        .insert(insertWithoutVisibility)
        .select()
        .maybeSingle();
      data = second.data;
      cErr = second.error;
    }

    setSaving(false);
    if (cErr || !data) {
      setError(formatUserFacingError(cErr ?? new Error('Create failed')));
      return;
    }
    const createdStatus =
      data.status !== undefined && typeof data.status === 'string' ? data.status : effectiveStatus;
    setStatus(createdStatus);
    if (itemType === 'workout') {
      toast.success('Workout created');
    } else if (itemType === 'workout_log') {
      toast.success('Workout log created');
    }
    onCreated?.(data.id as string);
  }, [
    assignedTo,
    bubbleId,
    canWrite,
    description,
    hasScheduledBoardColumn,
    hasTodayBoardColumn,
    itemType,
    metadataForSave,
    onCreated,
    priority,
    scheduledOn,
    scheduledTime,
    setError,
    setSaving,
    setStatus,
    status,
    title,
    visibility,
    calendarTimezone,
  ]);

  return { archiving, archiveTask, saveCoreFields, createTask };
}
