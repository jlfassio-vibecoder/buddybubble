'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import {
  type TaskActivityEntry,
  type TaskAttachment,
  type TaskComment,
  type TaskSubtask,
  asActivityLog,
  asAttachments,
  asComments,
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
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activityLog, setActivityLog] = useState<TaskActivityEntry[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [commentUserById, setCommentUserById] = useState<
    Record<string, { displayName: string; avatarUrl: string | null }>
  >({});

  const hydrateFromTaskRow = useCallback((row: TaskRow) => {
    setSubtasks(asSubtasks(row.subtasks));
    setComments(asComments(row.comments));
    setActivityLog(asActivityLog(row.activity_log));
    setAttachments(asAttachments(row.attachments));
  }, []);

  const resetForCreate = useCallback(() => {
    setSubtasks([]);
    setComments([]);
    setCommentUserById({});
    setActivityLog([]);
    setAttachments([]);
    setNewComment('');
    setNewSubtaskTitle('');
  }, []);

  useEffect(() => {
    if (!taskId || comments.length === 0) {
      setCommentUserById({});
      return;
    }
    const ids = [...new Set(comments.map((c) => c.user_id))];
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from('users')
      .select('id, full_name, email, avatar_url')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, { displayName: string; avatarUrl: string | null }> = {};
        for (const row of data as {
          id: string;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
        }[]) {
          const displayName =
            (row.full_name && row.full_name.trim()) || row.email?.split('@')[0] || 'Member';
          next[row.id] = { displayName, avatarUrl: row.avatar_url };
        }
        setCommentUserById(next);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, comments]);

  const addComment = useCallback(async () => {
    if (!canWrite || !taskId || !newComment.trim()) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const next: TaskComment[] = [
      ...comments,
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        body: newComment.trim(),
        created_at: new Date().toISOString(),
      },
    ];
    const { error: uErr } = await supabase
      .from('tasks')
      .update({ comments: next as unknown as TaskRow['comments'] })
      .eq('id', taskId);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      return;
    }
    setComments(next);
    setNewComment('');
  }, [canWrite, taskId, newComment, comments, setError]);

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
      .update({ subtasks: next as unknown as TaskRow['subtasks'] })
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
        .update({ subtasks: next as unknown as TaskRow['subtasks'] })
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
    comments,
    activityLog,
    setActivityLog,
    attachments,
    newComment,
    setNewComment,
    newSubtaskTitle,
    setNewSubtaskTitle,
    commentUserById,
    addComment,
    addSubtask,
    toggleSubtask,
    uploadAttachment,
    removeAttachment,
    hydrateFromTaskRow,
    resetForCreate,
  };
}
