'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Json, TaskRow } from '@/types/database';
import { taskActivityLogRowToEntry } from '@/lib/task-activity-log-persist';
import {
  type TaskActivityEntry,
  type TaskAttachment,
  type TaskSubtask,
  asAttachments,
} from '@/types/task-modal';
import { buildTaskAttachmentObjectPath, TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import { formatUserFacingError } from '@/lib/format-error';

export type UseTaskEmbeddedCollectionsArgs = {
  taskId: string | null;
  canWrite: boolean;
  workspaceId: string;
  setError: Dispatch<SetStateAction<string | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
};

export function useTaskEmbeddedCollections({
  taskId,
  canWrite,
  workspaceId,
  setError,
  setSaving,
}: UseTaskEmbeddedCollectionsArgs) {
  // Copilot suggestion ignored: subtasks/activity use `task_subtasks` / `task_activity_log` tables, not dropped JSON columns on `tasks`.
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [activityLog, setActivityLog] = useState<TaskActivityEntry[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const hydrateFromTaskRow = useCallback((row: TaskRow) => {
    setAttachments(asAttachments(row.attachments));
    const r = row as TaskRow & {
      task_subtasks?: Array<{
        id: string;
        title: string;
        completed: boolean;
        created_at: string;
        position: number;
      }>;
      task_activity_log?: Array<{
        id: string;
        user_id: string | null;
        action_type: string;
        payload: Json;
        created_at: string;
      }>;
    };
    if (r.task_subtasks?.length) {
      const sorted = [...r.task_subtasks].sort((a, b) => a.position - b.position);
      setSubtasks(
        sorted.map((s) => ({
          id: s.id,
          title: s.title,
          done: s.completed,
          created_at: s.created_at,
        })),
      );
    } else {
      setSubtasks([]);
    }
    if (r.task_activity_log?.length) {
      const sortedLogs = [...r.task_activity_log].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setActivityLog(sortedLogs.map((log) => taskActivityLogRowToEntry(log)));
    } else {
      setActivityLog([]);
    }
  }, []);

  const resetForCreate = useCallback(() => {
    setSubtasks([]);
    setActivityLog([]);
    setAttachments([]);
    setNewSubtaskTitle('');
  }, []);

  const addSubtask = useCallback(async () => {
    if (!canWrite || !taskId || !newSubtaskTitle.trim()) return;
    const supabase = createClient();
    const nextPosition = subtasks.length;
    const { data: inserted, error: uErr } = await supabase
      .from('task_subtasks')
      .insert({
        task_id: taskId,
        title: newSubtaskTitle.trim(),
        completed: false,
        position: nextPosition,
      })
      .select('id, title, completed, created_at')
      .maybeSingle();
    if (uErr || !inserted) {
      setError(formatUserFacingError(uErr ?? new Error('Could not add subtask.')));
      return;
    }
    const ins = inserted as { id: string; title: string; completed: boolean; created_at: string };
    setSubtasks([
      ...subtasks,
      { id: ins.id, title: ins.title, done: ins.completed, created_at: ins.created_at },
    ]);
    setNewSubtaskTitle('');
  }, [canWrite, taskId, newSubtaskTitle, subtasks, setError]);

  const toggleSubtask = useCallback(
    async (id: string) => {
      if (!canWrite || !taskId) return;
      const target = subtasks.find((s) => s.id === id);
      if (!target) return;
      const nextDone = !target.done;
      const supabase = createClient();
      const { error: uErr } = await supabase
        .from('task_subtasks')
        .update({ completed: nextDone })
        .eq('id', id);
      if (uErr) {
        setError(formatUserFacingError(uErr));
        return;
      }
      setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, done: nextDone } : s)));
    },
    [canWrite, taskId, subtasks, setError],
  );

  const uploadAttachment = useCallback(
    async (file: File) => {
      if (!canWrite || !taskId) return;
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const path = buildTaskAttachmentObjectPath(workspaceId, taskId, file.name);
      const { error: upErr } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });
      if (upErr) {
        setSaving(false);
        setError(formatUserFacingError(upErr));
        return;
      }
      const next: TaskAttachment[] = [
        ...attachments,
        {
          id: crypto.randomUUID(),
          name: file.name,
          path,
          size: file.size,
          uploaded_at: new Date().toISOString(),
          uploaded_by: user?.id ?? null,
        },
      ];
      const { error: uErr } = await supabase
        .from('tasks')
        .update({ attachments: next as unknown as TaskRow['attachments'] })
        .eq('id', taskId);
      setSaving(false);
      if (uErr) {
        setError(formatUserFacingError(uErr));
        void supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([path]);
        return;
      }
      setAttachments(next);
    },
    [canWrite, taskId, workspaceId, attachments, setError, setSaving],
  );

  const removeAttachment = useCallback(
    async (att: TaskAttachment) => {
      if (!canWrite || !taskId) return;
      const supabase = createClient();
      const next = attachments.filter((a) => a.id !== att.id);
      const { error: uErr } = await supabase
        .from('tasks')
        .update({ attachments: next as unknown as TaskRow['attachments'] })
        .eq('id', taskId);
      if (uErr) {
        setError(formatUserFacingError(uErr));
        return;
      }
      await supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([att.path]);
      setAttachments(next);
    },
    [canWrite, taskId, attachments, setError],
  );

  return {
    subtasks,
    activityLog,
    setActivityLog,
    attachments,
    newSubtaskTitle,
    setNewSubtaskTitle,
    addSubtask,
    toggleSubtask,
    uploadAttachment,
    removeAttachment,
    hydrateFromTaskRow,
    resetForCreate,
  };
}
