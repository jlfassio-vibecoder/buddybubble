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
import {
  TASK_PRIORITY_OPTIONS,
  type TaskPriority,
  normalizeTaskPriority,
} from '@/lib/task-priority';
import { taskDateFieldLabels } from '@/lib/task-date-labels';
import type { WorkspaceCategory } from '@/types/database';
import { buildTaskAttachmentObjectPath, TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import {
  createSignedUrlForTaskAttachmentThumb,
  isLikelyTaskAttachmentImageFileName,
} from '@/lib/task-attachment-url';
import { formatUserFacingError } from '@/lib/format-error';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import { promotedStatusForScheduledOnToday } from '@/lib/workspace-calendar';
import {
  formatScheduledTimeDisplay,
  scheduledTimeInputToPgValue,
  scheduledTimeToInputValue,
} from '@/lib/task-scheduled-time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

export type TaskModalTab = 'details' | 'comments' | 'subtasks' | 'activity';

type TabId = TaskModalTab;

/** Private bucket: must use signed URLs — raw `/storage/v1/object/...` 400s in the browser. */
function TaskAttachmentImagePreview({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void createSignedUrlForTaskAttachmentThumb(supabase, path).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!src) {
    return (
      <div
        className="h-10 w-10 shrink-0 animate-pulse rounded border border-slate-200 bg-slate-200/80"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover"
    />
  );
}

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
  /** When opening create mode, pre-select this Kanban column status if it exists on the board. */
  initialCreateStatus?: string | null;
  /** When opening an existing task, select this tab (ignored for create mode). */
  initialTab?: TaskModalTab | null;
  /** Drives Due by vs Scheduled on labels (`workspaces.category_type`). */
  workspaceCategory?: WorkspaceCategory | null;
  /** Workspace IANA timezone for scheduled-on vs calendar "today" (see `workspaces.calendar_timezone`). */
  calendarTimezone?: string | null;
};

export function TaskModal({
  open,
  onOpenChange,
  taskId,
  bubbleId,
  workspaceId,
  canWrite,
  onCreated,
  initialCreateStatus = null,
  initialTab = null,
  workspaceCategory = null,
  calendarTimezone = null,
}: TaskModalProps) {
  const [tab, setTab] = useState<TabId>('details');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  /** YYYY-MM-DD for `<input type="date" />` or empty */
  const [scheduledOn, setScheduledOn] = useState('');
  /** `HH:mm` for `<input type="time" />` or empty (requires date) */
  const [scheduledTime, setScheduledTime] = useState('');

  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activityLog, setActivityLog] = useState<TaskActivityEntry[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);

  const [newComment, setNewComment] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [commentUserById, setCommentUserById] = useState<
    Record<string, { displayName: string; avatarUrl: string | null }>
  >({});

  const boardColumnDefs = useBoardColumnDefs(workspaceId);

  const hasTodayBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'today') ?? false,
    [boardColumnDefs],
  );

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
    priority: TaskPriority;
    scheduledOn: string | null;
    /** Normalized `HH:mm` or null */
    scheduledTime: string | null;
  } | null>(null);

  const dateLabels = taskDateFieldLabels(workspaceCategory);

  const statusSelectOptions = useMemo(() => {
    if (status && !statusOptions.some((o) => o.value === status)) {
      return [...statusOptions, { value: status, label: status }];
    }
    return statusOptions;
  }, [statusOptions, status]);

  const applyRow = useCallback(
    (row: TaskRow) => {
      const nextStatus = row.status || defaultStatus;
      const nextPriority = normalizeTaskPriority(row.priority);
      setTitle(row.title);
      setDescription(row.description ?? '');
      setStatus(nextStatus);
      setPriority(nextPriority);
      const sched = row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : '';
      setScheduledOn(sched);
      setScheduledTime(scheduledTimeToInputValue((row as TaskRow).scheduled_time));
      setSubtasks(asSubtasks(row.subtasks));
      setComments(asComments(row.comments));
      setActivityLog(asActivityLog(row.activity_log));
      setAttachments(asAttachments(row.attachments));
      const st = scheduledTimeToInputValue((row as TaskRow).scheduled_time);
      originalRef.current = {
        title: row.title,
        description: row.description ?? '',
        status: nextStatus,
        priority: nextPriority,
        scheduledOn: row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : null,
        scheduledTime: st || null,
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
      setTab('details');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setScheduledOn('');
      setScheduledTime('');
      setSubtasks([]);
      setComments([]);
      setCommentUserById({});
      setActivityLog([]);
      setAttachments([]);
      originalRef.current = null;
      setError(null);
      return;
    }
    void loadTask(taskId);
  }, [open, taskId, loadTask]);

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

  useEffect(() => {
    if (!open || taskId) return;
    const fromBoard =
      initialCreateStatus && statusOptions.some((o) => o.value === initialCreateStatus)
        ? initialCreateStatus
        : null;
    setStatus(fromBoard ?? defaultStatus);
  }, [open, taskId, defaultStatus, initialCreateStatus, statusOptions]);

  useEffect(() => {
    if (!open || !taskId) return;
    setTab(initialTab ?? 'details');
  }, [open, taskId, initialTab]);

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
    const scheduledOnValue = scheduledOn.trim() ? scheduledOn.trim().slice(0, 10) : null;
    const newTimeHm = scheduledOnValue
      ? scheduledTime.trim()
        ? scheduledTime.trim().slice(0, 5)
        : null
      : null;
    const scheduledTimePg = newTimeHm ? scheduledTimeInputToPgValue(newTimeHm) : null;
    const schedChanged = orig != null && (scheduledOnValue ?? null) !== (orig.scheduledOn ?? null);
    const schedTimeChanged = orig != null && (newTimeHm ?? null) !== (orig.scheduledTime ?? null);
    const effectiveStatus = promotedStatusForScheduledOnToday({
      currentStatus: status,
      scheduledOnYmd: scheduledOnValue,
      calendarTimezone,
      hasTodayBoardColumn,
    });

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
      if (effectiveStatus !== orig.status) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'status',
          from: orig.status,
          to: effectiveStatus,
        });
      }
      if (priority !== orig.priority) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'priority',
          from: orig.priority,
          to: priority,
        });
      }
      const nextSched = scheduledOnValue;
      const prevSched = orig.scheduledOn;
      if (nextSched !== prevSched) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'scheduled_on',
          from: prevSched ?? '',
          to: nextSched ?? '',
        });
      }
      const prevTimeHm = orig.scheduledTime ?? null;
      if ((newTimeHm ?? null) !== (prevTimeHm ?? null)) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'scheduled_time',
          from: prevTimeHm ? (formatScheduledTimeDisplay(`${prevTimeHm}:00`) ?? prevTimeHm) : '',
          to: newTimeHm
            ? (formatScheduledTimeDisplay(scheduledTimeInputToPgValue(newTimeHm)) ?? newTimeHm)
            : '',
        });
      }
    }

    /** Only PATCH `scheduled_on` / `scheduled_time` when changed (400 if column missing). */

    const updateWithPriority = {
      title: title.trim(),
      description: description.trim() || null,
      status: effectiveStatus,
      priority,
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
        originalRef.current = {
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority: orig?.priority ?? priority,
          scheduledOn: orig?.scheduledOn ?? null,
          scheduledTime: orig?.scheduledTime ?? null,
        };
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
      const updateNoSched = {
        title: title.trim(),
        description: description.trim() || null,
        status: effectiveStatus,
        priority,
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
        setStatus(effectiveStatus);
        originalRef.current = {
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority: orig?.priority ?? priority,
          scheduledOn: orig?.scheduledOn ?? null,
          scheduledTime: orig?.scheduledTime ?? null,
        };
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
        ...(schedChanged ? { scheduled_on: scheduledOnValue } : {}),
        ...(schedTimeChanged ? { scheduled_time: scheduledTimePg } : {}),
        activity_log: activityWithoutPriority as unknown as TaskRow['activity_log'],
      };
      uErr = (await supabase.from('tasks').update(updateWithoutPriority).eq('id', taskId)).error;
      if (!uErr) {
        if (orig && priority !== orig.priority) setPriority(revertedPriority);
        setActivityLog(asActivityLog(activityWithoutPriority));
        setStatus(effectiveStatus);
        originalRef.current = {
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority: revertedPriority,
          scheduledOn: scheduledOnValue,
          scheduledTime: newTimeHm,
        };
        setSaving(false);
        void loadTask(taskId);
        return;
      }
    }

    setSaving(false);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      return;
    }
    setActivityLog(asActivityLog(nextActivity));
    setStatus(effectiveStatus);
    originalRef.current = {
      title: title.trim(),
      description: description.trim(),
      status: effectiveStatus,
      priority,
      scheduledOn: scheduledOnValue,
      scheduledTime: newTimeHm,
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

    const sched = scheduledOn.trim() ? scheduledOn.trim().slice(0, 10) : null;
    const createTimeHm = sched && scheduledTime.trim() ? scheduledTime.trim().slice(0, 5) : null;
    const scheduledTimeInsert = createTimeHm ? scheduledTimeInputToPgValue(createTimeHm) : null;
    const effectiveStatus = promotedStatusForScheduledOnToday({
      currentStatus: status,
      scheduledOnYmd: sched,
      calendarTimezone,
      hasTodayBoardColumn,
    });

    const insertRow = {
      bubble_id: bubbleId,
      title: title.trim(),
      description: description.trim() || null,
      status: effectiveStatus,
      priority,
      position: maxPos,
      scheduled_on: sched,
      ...(sched ? { scheduled_time: scheduledTimeInsert } : {}),
    };

    let { data, error: cErr } = await supabase
      .from('tasks')
      .insert(insertRow)
      .select()
      .maybeSingle();

    if (cErr && isMissingColumnSchemaCacheError(cErr, 'scheduled_on')) {
      const { scheduled_on: _s, scheduled_time: _t, ...insertNoSched } = insertRow;
      const retry = await supabase.from('tasks').insert(insertNoSched).select().maybeSingle();
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

    setSaving(false);
    if (cErr || !data) {
      setError(formatUserFacingError(cErr));
      return;
    }
    setStatus(effectiveStatus);
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
    const sched = scheduledOn.trim() ? scheduledOn.trim().slice(0, 10) : null;
    const timeHm = sched ? (scheduledTime.trim() ? scheduledTime.trim().slice(0, 5) : null) : null;
    if (!o) return isCreateMode && title.trim().length > 0;
    return (
      title.trim() !== o.title ||
      (description ?? '').trim() !== (o.description ?? '').trim() ||
      status !== o.status ||
      priority !== o.priority ||
      sched !== (o.scheduledOn ?? null) ||
      (timeHm ?? null) !== (o.scheduledTime ?? null)
    );
  }, [title, description, status, priority, scheduledOn, scheduledTime, isCreateMode]);

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
                  <div className="space-y-2">
                    <Label htmlFor="task-priority">Priority</Label>
                    <select
                      id="task-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TaskPriority)}
                      disabled={!canWrite}
                      className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                    >
                      {TASK_PRIORITY_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-row flex-wrap gap-3 items-end">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="task-scheduled-on">{dateLabels.primary}</Label>
                        <input
                          id="task-scheduled-on"
                          type="date"
                          value={scheduledOn}
                          onChange={(e) => {
                            const v = e.target.value;
                            setScheduledOn(v);
                            if (!v) setScheduledTime('');
                          }}
                          disabled={!canWrite}
                          className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="task-scheduled-time">
                          Time {!scheduledOn ? '(set a date first)' : '(optional)'}
                        </Label>
                        <input
                          id="task-scheduled-time"
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          disabled={!canWrite || !scheduledOn}
                          className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                        />
                      </div>
                    </div>
                    {dateLabels.helper ? (
                      <p className="text-xs text-muted-foreground">{dateLabels.helper}</p>
                    ) : null}
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
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {isLikelyTaskAttachmentImageFileName(a.name) ? (
                              <TaskAttachmentImagePreview path={a.path} />
                            ) : null}
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left text-indigo-700 hover:underline"
                              onClick={() => void downloadLink(a)}
                            >
                              {a.name}
                            </button>
                          </div>
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
                    <ul className="space-y-3">
                      {comments.map((c) => {
                        const author = commentUserById[c.user_id];
                        const displayName = author?.displayName ?? 'Member';
                        const avatarUrl = author?.avatarUrl ?? null;
                        return (
                          <li
                            key={c.id}
                            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                          >
                            <div className="flex gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-indigo-100 text-sm font-bold text-indigo-700">
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt={displayName}
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  (displayName[0]?.toUpperCase() ?? '?')
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <span className="font-bold text-slate-900">{displayName}</span>
                                  <span className="text-xs text-slate-400">
                                    {formatMessageTimestamp(c.created_at)}
                                  </span>
                                </div>
                                <p className="mt-0.5 whitespace-pre-wrap text-slate-800">
                                  {c.body}
                                </p>
                              </div>
                            </div>
                          </li>
                        );
                      })}
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
    if (e.field === 'priority') return `Priority changed to "${e.to ?? ''}"`;
  }
  return e.message || 'Activity';
}
