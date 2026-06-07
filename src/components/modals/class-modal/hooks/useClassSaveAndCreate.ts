'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import type { Json, TaskVisibility } from '@/types/database';
import { formatUserFacingError } from '@/lib/format-error';
import { classScheduledAtToTaskSchedule } from '@/lib/fitness/class-instance-task-sync';
import {
  insertTasksRowWithRetries,
  resolveInsertPosition,
} from '@/components/modals/task-modal/task-insert-row';

export type ClassOfferingSavePart = {
  workspace_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  location: string | null;
  metadata: Json;
};

export type ClassInstanceSavePart = {
  workspace_id: string;
  scheduled_at: string;
  capacity: number | null;
  instructor_id: string | null;
  instructor_notes: string | null;
  visibility: TaskVisibility;
  metadata: Json;
};

export type ClassSavePayload = {
  offering: ClassOfferingSavePart;
  instance: ClassInstanceSavePart;
};

export type ClassCreatedIds = {
  offeringId: string;
  instanceId: string;
  taskId: string;
};

function rlsFriendlyMessage(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level security') ||
    lower.includes('new row violates')
  ) {
    return 'Only workspace owners and admins can create or edit classes.';
  }
  return message;
}

export type UseClassSaveAndCreateArgs = {
  bubbleId: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  onCreated?: (ids: ClassCreatedIds) => void;
  onSaved?: () => void;
};

export function useClassSaveAndCreate({
  bubbleId,
  setError,
  setSaving,
  onCreated,
  onSaved,
}: UseClassSaveAndCreateArgs) {
  const createClass = useCallback(
    async (payload: ClassSavePayload): Promise<ClassCreatedIds | null> => {
      setSaving(true);
      setError(null);
      const supabase = createClient();

      if (!bubbleId?.trim()) {
        const msg = 'Choose a bubble before creating a class.';
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser?.id) {
        const msg = 'Sign in to create a class.';
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const { data: offeringRow, error: oErr } = await supabase
        .from('class_offerings')
        .insert({
          workspace_id: payload.offering.workspace_id,
          name: payload.offering.name,
          description: payload.offering.description,
          duration_min: payload.offering.duration_min,
          location: payload.offering.location,
          metadata: payload.offering.metadata,
        })
        .select('id')
        .maybeSingle();

      if (oErr || !offeringRow?.id) {
        const msg = rlsFriendlyMessage(
          formatUserFacingError(oErr ?? new Error('Create offering failed')),
        );
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const offeringId = offeringRow.id as string;
      const schedule = classScheduledAtToTaskSchedule(payload.instance.scheduled_at);
      const position = await resolveInsertPosition(supabase, bubbleId);

      const { data: taskRow, error: tErr } = await insertTasksRowWithRetries(
        supabase,
        {
          bubble_id: bubbleId,
          title: payload.offering.name,
          description: payload.offering.description,
          status: 'scheduled',
          priority: 'medium',
          position,
          scheduled_on: schedule.scheduled_on,
          scheduled_time: schedule.scheduled_time,
          item_type: 'class',
          metadata: {},
          visibility: payload.instance.visibility,
          created_by: authUser.id,
        },
        {
          status: 'scheduled',
          calendarTimezone: null,
          hasTodayBoardColumn: false,
        },
      );

      if (tErr || !taskRow?.id) {
        await supabase.from('class_offerings').delete().eq('id', offeringId);
        const msg = rlsFriendlyMessage(
          formatUserFacingError(tErr ?? new Error('Create class canvas failed')),
        );
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const taskId = taskRow.id as string;

      const { data: instRow, error: iErr } = await supabase
        .from('class_instances')
        .insert({
          workspace_id: payload.instance.workspace_id,
          offering_id: offeringId,
          task_id: taskId,
          scheduled_at: payload.instance.scheduled_at,
          capacity: payload.instance.capacity,
          instructor_id: payload.instance.instructor_id,
          instructor_notes: payload.instance.instructor_notes,
          visibility: payload.instance.visibility,
          metadata: payload.instance.metadata,
        })
        .select('id')
        .maybeSingle();

      if (iErr || !instRow?.id) {
        await supabase.from('tasks').delete().eq('id', taskId);
        await supabase.from('class_offerings').delete().eq('id', offeringId);
        const msg = rlsFriendlyMessage(
          formatUserFacingError(iErr ?? new Error('Create class instance failed')),
        );
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return null;
      }

      const instanceId = instRow.id as string;
      toast.success('Class created');
      const ids = { offeringId, instanceId, taskId };
      onCreated?.(ids);
      setSaving(false);
      return ids;
    },
    [bubbleId, onCreated, setError, setSaving],
  );

  const saveClass = useCallback(
    async (offeringId: string, instanceId: string, payload: ClassSavePayload): Promise<boolean> => {
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const now = new Date().toISOString();

      const { data: instanceRow, error: loadErr } = await supabase
        .from('class_instances')
        .select('task_id')
        .eq('id', instanceId)
        .maybeSingle();

      if (loadErr || !instanceRow?.task_id) {
        const msg = rlsFriendlyMessage(
          formatUserFacingError(loadErr ?? new Error('Class canvas link is missing')),
        );
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return false;
      }

      const taskId = instanceRow.task_id as string;
      const schedule = classScheduledAtToTaskSchedule(payload.instance.scheduled_at);

      const { error: oErr } = await supabase
        .from('class_offerings')
        .update({
          name: payload.offering.name,
          description: payload.offering.description,
          duration_min: payload.offering.duration_min,
          location: payload.offering.location,
          metadata: payload.offering.metadata,
          updated_at: now,
        })
        .eq('id', offeringId);

      if (oErr) {
        const msg = rlsFriendlyMessage(formatUserFacingError(oErr));
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return false;
      }

      const { error: iErr } = await supabase
        .from('class_instances')
        .update({
          scheduled_at: payload.instance.scheduled_at,
          capacity: payload.instance.capacity,
          instructor_id: payload.instance.instructor_id,
          instructor_notes: payload.instance.instructor_notes,
          visibility: payload.instance.visibility,
          metadata: payload.instance.metadata,
          updated_at: now,
        })
        .eq('id', instanceId);

      if (iErr) {
        const msg = rlsFriendlyMessage(formatUserFacingError(iErr));
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return false;
      }

      const { error: taskErr } = await supabase
        .from('tasks')
        .update({
          title: payload.offering.name,
          description: payload.offering.description,
          visibility: payload.instance.visibility,
          scheduled_on: schedule.scheduled_on,
          scheduled_time: schedule.scheduled_time,
        })
        .eq('id', taskId);

      if (taskErr) {
        const msg = rlsFriendlyMessage(formatUserFacingError(taskErr));
        setError(msg);
        toast.error(msg);
        setSaving(false);
        return false;
      }

      toast.success('Class saved');
      onSaved?.();
      setSaving(false);
      return true;
    },
    [onSaved, setError, setSaving],
  );

  return { createClass, saveClass };
}
