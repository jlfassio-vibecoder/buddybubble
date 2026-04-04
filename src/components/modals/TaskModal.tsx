'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import {
  type TaskActivityEntry,
  type TaskAttachment,
  type TaskComment,
  type TaskSubtask,
  TASK_STATUSES,
  appendActivityForFieldChange,
  asActivityLog,
  asAttachments,
  asComments,
  asSubtasks,
} from '@/types/task-modal';
import { buildTaskAttachmentObjectPath, TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import { formatUserFacingError } from '@/lib/format-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

type TabId = 'details' | 'comments' | 'subtasks' | 'activity';

export type TaskModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When null and modal is open, create a new task for `bubbleId`. */
  taskId: string | null;
  bubbleId: string | null;
  workspaceId: string;
  canWrite: boolean;
  /** Called after a task is created so the parent can keep the modal in edit mode. */
  onCreated?: (newTaskId: string) => void;
};

export function TaskModal({
  open,
  onOpenChange,
  taskId,
  bubbleId,
  workspaceId,
  canWrite,
  onCreated,
}: TaskModalProps) {
  const [tab, setTab] = useState<TabId>('details');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('todo');

  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activityLog, setActivityLog] = useState<TaskActivityEntry[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);

  const [newComment, setNewComment] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const boardColumnDefs = useBoardColumnDefs(workspaceId);

  const statusOptions = useMemo(() => {
    if (boardColumnDefs === null) {
      return TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }));
    }
    if (boardColumnDefs.length === 0) {
      return TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }));
    }
    return boardColumnDefs.map((c) => ({ value: c.id, label: c.label }));
  }, [boardColumnDefs]);

  const defaultStatus = statusOptions[0]?.value ?? 'todo';

  const originalRef = useRef<{
    title: string;
    description: string;
    status: string;
  } | null>(null);

  const statusSelectOptions = useMemo(() => {
    if (status && !statusOptions.some((o) => o.value === status)) {
      return [...statusOptions, { value: status, label: status }];
    }
    return statusOptions;
  }, [statusOptions, status]);

  const applyRow = useCallback(
    (row: TaskRow) => {
      const nextStatus = row.status || defaultStatus;
      setTitle(row.title);
      setDescription(row.description ?? '');
      setStatus(nextStatus);
      setSubtasks(asSubtasks(row.subtasks));
      setComments(asComments(row.comments));
      setActivityLog(asActivityLog(row.activity_log));
      setAttachments(asAttachments(row.attachments));
      originalRef.current = {
        title: row.title,
        description: row.description ?? '',
        status: nextStatus,
      };
    },
    [defaultStatus],
  );

  const loadTask = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      setLoading(false);
      if (qErr || !data) {
        setError(qErr?.message ?? 'Task not found');
        return;
      }
      applyRow(data as TaskRow);
    },
    [applyRow],
  );

  useEffect(() => {
    if (!open) return;
    if (!taskId) {
      setTitle('');
      setDescription('');
      setSubtasks([]);
      setComments([]);
      setActivityLog([]);
      setAttachments([]);
      originalRef.current = null;
      setError(null);
      return;
    }
    void loadTask(taskId);
  }, [open, taskId, loadTask]);

  useEffect(() => {
    if (!open || taskId) return;
    setStatus(defaultStatus);
  }, [open, taskId, defaultStatus]);

  useEffect(() => {
    if (!open || !taskId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`task-modal:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        () => {
          void loadTask(taskId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, taskId, loadTask]);

  const isCreateMode = open && !taskId && !!bubbleId;

  const saveCoreFields = async () => {
    if (!canWrite || !taskId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id ?? null;

    const orig = originalRef.current;
    let nextActivity = [...activityLog];
    if (orig) {
      if (title.trim() !== orig.title) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'title',
          from: orig.title,
          to: title.trim(),
        });
      }
      if ((description ?? '').trim() !== (orig.description ?? '').trim()) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'description',
          from: orig.description ?? '',
          to: description ?? '',
        });
      }
      if (status !== orig.status) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'status',
          from: orig.status,
          to: status,
        });
      }
    }

    const { error: uErr } = await supabase
      .from('tasks')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        status,
        activity_log: nextActivity as unknown as TaskRow['activity_log'],
      })
      .eq('id', taskId);

    setSaving(false);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      return;
    }
    setActivityLog(asActivityLog(nextActivity));
    originalRef.current = {
      title: title.trim(),
      description: description.trim(),
      status,
    };
    void loadTask(taskId);
  };

  const createTask = async () => {
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

    const { data, error: cErr } = await supabase
      .from('tasks')
      .insert({
        bubble_id: bubbleId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        position: maxPos,
      })
      .select()
      .maybeSingle();

    setSaving(false);
    if (cErr || !data) {
      setError(formatUserFacingError(cErr));
      return;
    }
    onCreated?.(data.id as string);
  };

  const addComment = async () => {
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
  };

  const addSubtask = async () => {
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
  };

  const toggleSubtask = async (id: string) => {
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
  };

  const uploadAttachment = async (file: File) => {
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
  };

  const removeAttachment = async (att: TaskAttachment) => {
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
  };

  const downloadLink = async (att: TaskAttachment) => {
    const supabase = createClient();
    const { data, error: sErr } = await supabase.storage
      .from(TASK_ATTACHMENTS_BUCKET)
      .createSignedUrl(att.path, 3600);
    if (sErr || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const coreDirty = useMemo(() => {
    const o = originalRef.current;
    if (!o) return isCreateMode && title.trim().length > 0;
    return (
      title.trim() !== o.title ||
      (description ?? '').trim() !== (o.description ?? '').trim() ||
      status !== o.status
    );
  }, [title, description, status, isCreateMode]);

  if (!open) return null;

  const tabBtn = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        tab === id ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isCreateMode ? 'New task' : 'Task'}
            </h2>
            <p className="text-xs text-slate-500">
              {isCreateMode ? 'Create a task for this bubble' : 'View and edit task details'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-6 py-2">
          {tabBtn('details', 'Details')}
          {tabBtn('comments', 'Comments')}
          {tabBtn('subtasks', 'Subtasks')}
          {tabBtn('activity', 'Activity')}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading && taskId ? <p className="text-sm text-slate-500">Loading task…</p> : null}

          {!loading || !taskId ? (
            <>
              {tab === 'details' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="task-title">Title</Label>
                    <Input
                      id="task-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={!canWrite}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-desc">Description</Label>
                    <Textarea
                      id="task-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={!canWrite}
                      rows={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-status">Status</Label>
                    <select
                      id="task-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={!canWrite}
                      className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {statusSelectOptions.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-2">
                    <Label>Attachments</Label>
                    {!isCreateMode && taskId && canWrite && (
                      <input
                        type="file"
                        className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-2 file:py-1"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void uploadAttachment(f);
                        }}
                      />
                    )}
                    {isCreateMode && (
                      <p className="text-xs text-slate-500">
                        Save the task first, then you can upload files.
                      </p>
                    )}
                    <ul className="space-y-1">
                      {attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-sm"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-indigo-700 hover:underline"
                            onClick={() => void downloadLink(a)}
                          >
                            {a.name}
                          </button>
                          {canWrite && !isCreateMode && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-red-600"
                              onClick={() => void removeAttachment(a)}
                            >
                              Remove
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {canWrite && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {isCreateMode ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving || !title.trim()}
                          onClick={() => void createTask()}
                        >
                          {saving ? 'Creating…' : 'Create task'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving || !coreDirty}
                          onClick={() => void saveCoreFields()}
                        >
                          {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === 'comments' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {comments.length === 0 && (
                      <p className="text-sm text-slate-500">No comments yet.</p>
                    )}
                    <ul className="space-y-2">
                      {comments.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <p className="whitespace-pre-wrap text-slate-800">{c.body}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {new Date(c.created_at).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {canWrite && taskId && (
                    <div className="space-y-2">
                      <Label htmlFor="new-comment">Add comment</Label>
                      <Textarea
                        id="new-comment"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={3}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!newComment.trim()}
                        onClick={() => void addComment()}
                      >
                        Post comment
                      </Button>
                    </div>
                  )}
                  {isCreateMode && (
                    <p className="text-xs text-slate-500">Create the task to add comments.</p>
                  )}
                </div>
              )}

              {tab === 'subtasks' && (
                <div className="space-y-4">
                  <ul className="space-y-2">
                    {subtasks.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={() => void toggleSubtask(s.id)}
                          disabled={!canWrite || !taskId}
                          className="rounded border-slate-300"
                        />
                        <span className={s.done ? 'text-slate-400 line-through' : 'text-slate-800'}>
                          {s.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canWrite && taskId && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="New subtask"
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        className="h-9"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void addSubtask()}
                        disabled={!newSubtaskTitle.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                  {isCreateMode && (
                    <p className="text-xs text-slate-500">Create the task to add subtasks.</p>
                  )}
                </div>
              )}

              {tab === 'activity' && (
                <ul className="space-y-2">
                  {activityLog.length === 0 && (
                    <p className="text-sm text-slate-500">No activity yet.</p>
                  )}
                  {activityLog.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                    >
                      <p>{formatActivityLine(e)}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {new Date(e.at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatActivityLine(e: TaskActivityEntry): string {
  if (e.type === 'field_change' && e.field) {
    if (e.field === 'title') return `Title updated`;
    if (e.field === 'description') return `Description updated`;
    if (e.field === 'status') return `Status changed to "${e.to ?? ''}"`;
  }
  return e.message || 'Activity';
}
