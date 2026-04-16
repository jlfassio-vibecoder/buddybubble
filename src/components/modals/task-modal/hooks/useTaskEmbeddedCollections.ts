'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { Json, TaskRow } from '@/types/database';
import {
  type TaskActivityEntry,
  type TaskAttachment,
  type TaskSubtask,
  asActivityLog,
  asAttachments,
  asSubtasks,
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
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [activityLog, setActivityLog] = useState<TaskActivityEntry[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const hydrateFromTaskRow = useCallback((row: TaskRow) => {
    // @ts-ignore — `tasks.subtasks` JSON removed; table-backed subtasks refactor is tracked separately.
    setSubtasks(asSubtasks(row.subtasks));
    // @ts-ignore — `tasks.activity_log` JSON removed; table-backed activity refactor is tracked separately.
    setActivityLog(asActivityLog(row.activity_log));
    setAttachments(asAttachments(row.attachments));
  }, []);

  const resetForCreate = useCallback(() => {
    setSubtasks([]);
    setActivityLog([]);
    setAttachments([]);
    setNewSubtaskTitle('');
  }, []);

  const addSubtask = useCallback(async () => {
    if (!canWrite || !taskId || !newSubtaskTitle.trim()) return;
    const next: TaskSubtask[] = [
      ...subtasks,
      {
        id: crypto.randomUUID(),
        title: newSubtaskTitle.trim(),
        done: false,
        created_at: new Date().toISOString(),
      },
    ];
    const supabase = createClient();
    const { error: uErr } = await supabase
      .from('tasks')
      .update({ subtasks: next as unknown as Json })
      .eq('id', taskId);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      return;
    }
    setSubtasks(next);
    setNewSubtaskTitle('');
  }, [canWrite, taskId, newSubtaskTitle, subtasks, setError]);

  const toggleSubtask = useCallback(
    async (id: string) => {
      if (!canWrite || !taskId) return;
      const next = subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
      const supabase = createClient();
      const { error: uErr } = await supabase
        .from('tasks')
        .update({ subtasks: next as unknown as Json })
        .eq('id', taskId);
      if (uErr) {
        setError(formatUserFacingError(uErr));
        return;
      }
      setSubtasks(next);
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
