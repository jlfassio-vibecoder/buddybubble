'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Globe, ListTree, Lock, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import {
  normalizeItemType,
  type ItemType,
  type Json,
  type TaskRow,
  type TaskVisibility,
  type UnitSystem,
} from '@/types/database';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';
import { WorkoutExercisesEditor } from '@/components/fitness/workout-exercises-editor';
import { WorkoutViewerDialog } from '@/components/fitness/workout-viewer-dialog';
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
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type ProgramWeek,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { useWorkoutTemplates, type WorkoutTemplate } from '@/hooks/use-workout-templates';
import {
  postGenerateWorkoutChain,
  postPersonalizeProgram,
  WORKOUT_FACTORY_CHAIN_MESSAGES,
} from '@/lib/workout-factory/api-client';
import { archiveDuplicateProgramsFromSameTemplate } from '@/lib/fitness/archive-duplicate-template-programs';
import { archiveOpenChildWorkoutsForProgram } from '@/lib/fitness/archive-program-child-workouts';
import { hasOtherActiveProgramForUserInWorkspace } from '@/lib/fitness/active-program-for-user';
import {
  resolveThirdKanbanStatusSlug,
  upsertProgramWorkoutTasks,
} from '@/lib/fitness/upsert-program-workout-tasks';
import { syncProgramLinkedWorkoutSchedules } from '@/lib/fitness/sync-program-workout-schedules';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';
import {
  alignStatusWithFutureSchedule,
  promotedStatusForScheduledOnToday,
} from '@/lib/workspace-calendar';
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
import { ItemTypeSelector } from '@/components/board/item-type-selector';
import { WorkoutPlayerTriggers } from '@/components/fitness/WorkoutPlayer';
import { indefiniteArticleForUiNoun, itemTypeUiNoun } from '@/lib/item-type-styles';
import { taskColumnIsCompletionStatus } from '@/lib/kanban-column-semantic';
import { cn } from '@/lib/utils';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import { usePresenceStore } from '@/store/presenceStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { PremiumGate } from '@/components/subscription/premium-gate';

export type TaskModalTab = 'details' | 'comments' | 'subtasks' | 'activity';

type TabId = TaskModalTab;

function normalizeTaskVisibility(value: unknown): TaskVisibility {
  return value === 'public' ? 'public' : 'private';
}

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
        className="h-10 w-10 shrink-0 animate-pulse rounded border border-border bg-muted"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-10 w-10 shrink-0 rounded border border-border object-cover"
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
  /** When opening create mode, pre-select item type (e.g. `workout` from Programs “This week” plan). */
  initialCreateItemType?: ItemType | null;
  /** When opening create mode, pre-fill title. */
  initialCreateTitle?: string | null;
  /** When opening create mode as a workout, pre-fill duration (minutes) string. */
  initialCreateWorkoutDurationMin?: string | null;
  /** When opening an existing task, select this tab (ignored for create mode). */
  initialTab?: TaskModalTab | null;
  /** Drives Due by vs Scheduled on labels (`workspaces.category_type`). */
  workspaceCategory?: WorkspaceCategory | null;
  /** Workspace IANA timezone for scheduled-on vs calendar "today" (see `workspaces.calendar_timezone`). */
  calendarTimezone?: string | null;
  /** After a successful archive (existing task only); parent should refresh board/calendar lists. */
  onTaskArchived?: () => void;
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
  initialCreateItemType = null,
  initialCreateTitle = null,
  initialCreateWorkoutDurationMin = null,
  initialTab = null,
  workspaceCategory = null,
  calendarTimezone = null,
  onTaskArchived,
}: TaskModalProps) {
  const updateFocus = usePresenceStore((s) => s.updateFocus);
  const activeBubble = useWorkspaceStore((s) => s.activeBubble);

  useEffect(() => {
    if (!open) {
      if (activeBubble?.id && activeBubble.id !== ALL_BUBBLES_BUBBLE_ID) {
        void updateFocus({ focus_type: 'bubble', focus_id: activeBubble.id });
      } else {
        void updateFocus({ focus_type: 'workspace', focus_id: null });
      }
      return;
    }
    if (taskId) {
      void updateFocus({ focus_type: 'task', focus_id: taskId });
      return;
    }
    if (activeBubble?.id && activeBubble.id !== ALL_BUBBLES_BUBBLE_ID) {
      void updateFocus({ focus_type: 'bubble', focus_id: activeBubble.id });
    } else {
      void updateFocus({ focus_type: 'workspace', focus_id: null });
    }
  }, [open, taskId, activeBubble?.id, updateFocus]);

  const [tab, setTab] = useState<TabId>('details');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  /** YYYY-MM-DD for `<input type="date" />` or empty */
  const [scheduledOn, setScheduledOn] = useState('');
  /** `HH:mm` for `<input type="time" />` or empty (requires date) */
  const [scheduledTime, setScheduledTime] = useState('');
  const [itemType, setItemType] = useState<ItemType>('task');
  const [visibility, setVisibility] = useState<TaskVisibility>('private');
  /** Workspace member user id, or null = unassigned */
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [workspaceMembersForAssign, setWorkspaceMembersForAssign] = useState<
    { user_id: string; label: string }[]
  >([]);
  const [metadata, setMetadata] = useState<Json>({});
  const [eventLocation, setEventLocation] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [experienceSeason, setExperienceSeason] = useState('');
  /** YYYY-MM-DD experience span end (`metadata.end_date`). */
  const [experienceEndDate, setExperienceEndDate] = useState('');
  const [memoryCaption, setMemoryCaption] = useState('');
  const [workoutType, setWorkoutType] = useState('');
  const [workoutDurationMin, setWorkoutDurationMin] = useState('');
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [workoutViewerOpen, setWorkoutViewerOpen] = useState(false);
  /** Unit system from the user's fitness profile; drives weight labels. */
  const [workoutUnitSystem, setWorkoutUnitSystem] = useState<UnitSystem>('metric');
  /** Whether the template picker is expanded (create mode only). */
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [aiWorkoutGenerating, setAiWorkoutGenerating] = useState(false);
  const [aiProgramPersonalizing, setAiProgramPersonalizing] = useState(false);
  const [aiWorkoutProgressIdx, setAiWorkoutProgressIdx] = useState(0);

  /** Program-specific fields. */
  const [programGoal, setProgramGoal] = useState('');
  const [programDurationWeeks, setProgramDurationWeeks] = useState('');
  const [programCurrentWeek, setProgramCurrentWeek] = useState(0);
  const [programSchedule, setProgramSchedule] = useState<ProgramWeek[]>([]);
  const [programSourceTitle, setProgramSourceTitle] = useState('');

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

  // Load workout templates when the user is composing a workout (create mode).
  const isWorkoutItemType = itemType === 'workout' || itemType === 'workout_log';
  const { templates: workoutTemplates } = useWorkoutTemplates(
    isWorkoutItemType && !taskId ? workspaceId : null,
  );

  // Fetch the user's unit system from their fitness profile so weight labels are accurate.
  useEffect(() => {
    if (!open || !isWorkoutItemType) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      void supabase
        .from('fitness_profiles')
        .select('unit_system')
        .eq('workspace_id', workspaceId)
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: fp }) => {
          if (cancelled) return;
          setWorkoutUnitSystem((fp?.unit_system as UnitSystem | null) ?? 'metric');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, isWorkoutItemType, workspaceId]);

  const hasTodayBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'today') ?? false,
    [boardColumnDefs],
  );

  const hasScheduledBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'scheduled') ?? false,
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
    itemType: ItemType;
    /** Stable string for dirty checks */
    metadataJson: string;
    visibility: TaskVisibility;
    assignedTo: string | null;
  } | null>(null);

  const dateLabels = taskDateFieldLabels(workspaceCategory);

  useEffect(() => {
    if (!open || !workspaceId) {
      setWorkspaceMembersForAssign([]);
      return;
    }
    let cancelled = false;
    async function loadAssignees() {
      const supabase = createClient();
      const { data } = await supabase
        .from('workspace_members')
        .select('user_id, users ( full_name, email )')
        .eq('workspace_id', workspaceId);
      if (cancelled || !data) return;
      const opts: { user_id: string; label: string }[] = [];
      for (const row of data as unknown as Array<{
        user_id: string;
        users:
          | { full_name: string | null; email: string | null }
          | { full_name: string | null; email: string | null }[]
          | null;
      }>) {
        const u = Array.isArray(row.users) ? row.users[0] : row.users;
        const label = (u?.full_name && u.full_name.trim()) || u?.email?.split('@')[0] || 'Member';
        opts.push({ user_id: row.user_id, label });
      }
      opts.sort((a, b) => a.label.localeCompare(b.label));
      setWorkspaceMembersForAssign(opts);
    }
    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  const applyWorkoutTemplate = useCallback(
    (tpl: WorkoutTemplate) => {
      const fields = metadataFieldsFromParsed(tpl.metadata);
      if (!title.trim()) setTitle(tpl.title);
      if (fields.workoutType) setWorkoutType(fields.workoutType);
      if (fields.workoutDurationMin) setWorkoutDurationMin(fields.workoutDurationMin);
      if (fields.workoutExercises.length) setWorkoutExercises(fields.workoutExercises);
      setTemplatePickerOpen(false);
    },
    [title],
  );

  useEffect(() => {
    if (!aiWorkoutGenerating) {
      setAiWorkoutProgressIdx(0);
      return;
    }
    setAiWorkoutProgressIdx(0);
    const id = window.setInterval(() => {
      setAiWorkoutProgressIdx((i) => Math.min(i + 1, WORKOUT_FACTORY_CHAIN_MESSAGES.length - 1));
    }, 15000);
    return () => window.clearInterval(id);
  }, [aiWorkoutGenerating]);

  const handleAiGenerateWorkout = useCallback(async () => {
    if (!canWrite || !workspaceId || !isWorkoutItemType) return;
    setAiWorkoutGenerating(true);
    try {
      const duration = parseInt(workoutDurationMin, 10);
      const data = await postGenerateWorkoutChain({
        workspace_id: workspaceId,
        daily_checkin: null,
        persona: {
          title: title.trim() || undefined,
          sessionDurationMinutes: !Number.isNaN(duration) && duration > 0 ? duration : 45,
        },
      });
      setTitle((t) => (t.trim() ? t : data.suggestedTitle || t));
      setDescription((d) => (d.trim() ? d : data.suggestedDescription || d));
      setWorkoutExercises(data.taskExercises);
      setWorkoutType((wt) => (wt.trim() ? wt : 'Generated'));
      setMetadata((prev) => {
        const o = parseTaskMetadata(prev) as Record<string, unknown>;
        return {
          ...o,
          ai_workout_factory: {
            generated_at: data.chain_metadata.generated_at,
            model: data.chain_metadata.model_used,
            workout_set: data.workoutSet,
            chain_metadata: data.chain_metadata,
          },
        } as unknown as Json;
      });
      toast.success('Workout generated — review exercises and save.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setAiWorkoutGenerating(false);
    }
  }, [canWrite, workspaceId, isWorkoutItemType, workoutDurationMin, title]);

  const viewerWorkoutSet = useMemo((): WorkoutSetTemplate | null => {
    const o = parseTaskMetadata(metadata) as Record<string, unknown>;
    const ai = o.ai_workout_factory;
    if (!ai || typeof ai !== 'object') return null;
    const ws = (ai as { workout_set?: unknown }).workout_set;
    if (!ws || typeof ws !== 'object') return null;
    return ws as WorkoutSetTemplate;
  }, [metadata]);

  const hasWorkoutViewerContent =
    isWorkoutItemType && (workoutExercises.length > 0 || viewerWorkoutSet != null);

  const handleWorkoutViewerApply = useCallback(
    (payload: { title: string; description: string; exercises: WorkoutExercise[] }) => {
      setTitle(payload.title);
      setDescription(payload.description);
      setWorkoutExercises(payload.exercises);
      setMetadata((prev) => {
        const o = parseTaskMetadata(prev) as Record<string, unknown>;
        const next = { ...o };
        delete next.ai_workout_factory;
        return next as Json;
      });
    },
    [],
  );

  const metadataForSave = useMemo(
    () =>
      buildTaskMetadataPayload(
        itemType,
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
          programSourceTitle,
        },
        metadata,
      ),
    [
      itemType,
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
      programSourceTitle,
      metadata,
    ],
  );

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
      const nextItemType = normalizeItemType((row as TaskRow).item_type);
      const nextMeta = parseTaskMetadata((row as TaskRow).metadata);
      setItemType(nextItemType);
      setMetadata(nextMeta);
      const mf = metadataFieldsFromParsed(nextMeta);
      setEventLocation(mf.eventLocation);
      setEventUrl(mf.eventUrl);
      setExperienceSeason(mf.experienceSeason);
      setExperienceEndDate(mf.experienceEndDate);
      setMemoryCaption(mf.memoryCaption);
      setWorkoutType(mf.workoutType);
      setWorkoutDurationMin(mf.workoutDurationMin);
      setWorkoutExercises(mf.workoutExercises);
      setProgramGoal(mf.programGoal);
      setProgramDurationWeeks(mf.programDurationWeeks);
      setProgramCurrentWeek(mf.programCurrentWeek);
      setProgramSchedule(mf.programSchedule);
      setProgramSourceTitle(mf.programSourceTitle);
      setSubtasks(asSubtasks(row.subtasks));
      setComments(asComments(row.comments));
      setActivityLog(asActivityLog(row.activity_log));
      setAttachments(asAttachments(row.attachments));
      const vis = normalizeTaskVisibility((row as TaskRow).visibility);
      setVisibility(vis);
      const assignee = (row as TaskRow).assigned_to ?? null;
      setAssignedTo(assignee);
      const st = scheduledTimeToInputValue((row as TaskRow).scheduled_time);
      originalRef.current = {
        title: row.title,
        description: row.description ?? '',
        status: nextStatus,
        priority: nextPriority,
        scheduledOn: row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : null,
        scheduledTime: st || null,
        itemType: nextItemType,
        metadataJson: JSON.stringify(buildTaskMetadataPayload(nextItemType, mf, nextMeta)),
        visibility: vis,
        assignedTo: assignee,
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
        setError(qErr?.message ?? 'Card not found');
        return;
      }
      applyRow(data as TaskRow);
    },
    [applyRow],
  );

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
          activity_log: nextActivity as unknown as TaskRow['activity_log'],
        })
        .eq('id', taskId);

      if (updErr) {
        toast.error(formatUserFacingError(updErr));
        return;
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
  ]);

  useEffect(() => {
    if (!open) return;
    if (!taskId) {
      setTab('details');
      const nextItemType = initialCreateItemType ?? 'task';
      setTitle(initialCreateTitle ?? '');
      setDescription('');
      setPriority('medium');
      setScheduledOn('');
      setScheduledTime('');
      setItemType(nextItemType);
      setMetadata({});
      setEventLocation('');
      setEventUrl('');
      setExperienceSeason('');
      setExperienceEndDate('');
      setMemoryCaption('');
      setWorkoutType('');
      setWorkoutDurationMin(
        (nextItemType === 'workout' || nextItemType === 'workout_log') &&
          initialCreateWorkoutDurationMin != null &&
          initialCreateWorkoutDurationMin !== ''
          ? initialCreateWorkoutDurationMin
          : '',
      );
      setWorkoutExercises([]);
      setWorkoutUnitSystem('metric');
      setTemplatePickerOpen(false);
      setProgramGoal('');
      setProgramDurationWeeks('');
      setProgramCurrentWeek(0);
      setProgramSchedule([]);
      setProgramSourceTitle('');
      setSubtasks([]);
      setComments([]);
      setCommentUserById({});
      setActivityLog([]);
      setAttachments([]);
      setVisibility('private');
      setAssignedTo(null);
      originalRef.current = null;
      setError(null);
      return;
    }
    void loadTask(taskId);
  }, [
    open,
    taskId,
    loadTask,
    initialCreateItemType,
    initialCreateTitle,
    initialCreateWorkoutDurationMin,
  ]);

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
    const fromColumn = initialCreateStatus?.trim() || null;
    if (fromColumn) {
      setStatus(fromColumn);
      return;
    }
    setStatus(defaultStatus);
  }, [open, taskId, defaultStatus, initialCreateStatus]);

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
  const typeNoun = itemTypeUiNoun(itemType);
  const modalTitle = isCreateMode ? `New ${typeNoun}` : `Edit ${typeNoun}`;
  const modalSubtitle = isCreateMode
    ? `Create ${indefiniteArticleForUiNoun(typeNoun)} ${typeNoun} for this bubble`
    : `View and edit ${typeNoun} details`;

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
  }, [archiving, canWrite, itemType, onOpenChange, onTaskArchived, taskId]);

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
    let effectiveStatus = promotedStatusForScheduledOnToday({
      currentStatus: status,
      scheduledOnYmd: scheduledOnValue,
      calendarTimezone,
      hasTodayBoardColumn,
    });
    effectiveStatus = alignStatusWithFutureSchedule({
      status: effectiveStatus,
      scheduledOnYmd: scheduledOnValue,
      calendarTimezone,
      hasScheduledBoardColumn,
      itemType,
    });

    const typeMetaPatch = {
      item_type: itemType,
      metadata: metadataForSave as TaskRow['metadata'],
    };

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
      if (visibility !== orig.visibility) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'visibility',
          from: orig.visibility,
          to: visibility,
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
      const nextAssign = assignedTo ?? null;
      const prevAssign = orig.assignedTo ?? null;
      if (nextAssign !== prevAssign) {
        nextActivity = appendActivityForFieldChange(nextActivity, {
          userId: uid,
          field: 'assigned_to',
          from: prevAssign ?? '',
          to: nextAssign ?? '',
        });
      }
    }

    /** Only PATCH `scheduled_on` / `scheduled_time` when changed (400 if column missing). */

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
        originalRef.current = {
          title: title.trim(),
          description: description.trim(),
          status: effectiveStatus,
          priority: orig?.priority ?? priority,
          scheduledOn: orig?.scheduledOn ?? null,
          scheduledTime: orig?.scheduledTime ?? null,
          itemType,
          metadataJson: JSON.stringify(metadataForSave),
          visibility: orig?.visibility ?? visibility,
          assignedTo: orig?.assignedTo ?? assignedTo,
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
      // Cannot persist scheduled_on: only promote scheduled→today from a date already loaded from DB, not from unsaved UI input.
      const statusWithoutSavedSchedule = promotedStatusForScheduledOnToday({
        currentStatus: status,
        scheduledOnYmd: orig?.scheduledOn ?? null,
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
        originalRef.current = {
          title: title.trim(),
          description: description.trim(),
          status: statusWithoutSavedSchedule,
          priority: orig?.priority ?? priority,
          scheduledOn: orig?.scheduledOn ?? null,
          scheduledTime: orig?.scheduledTime ?? null,
          itemType,
          metadataJson: JSON.stringify(metadataForSave),
          visibility: orig?.visibility ?? visibility,
          assignedTo: orig?.assignedTo ?? assignedTo,
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
        originalRef.current = {
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
        };
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
        originalRef.current = {
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
        };
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
    originalRef.current = {
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
    let effectiveStatus = promotedStatusForScheduledOnToday({
      currentStatus: status,
      scheduledOnYmd: sched,
      calendarTimezone,
      hasTodayBoardColumn,
    });
    effectiveStatus = alignStatusWithFutureSchedule({
      status: effectiveStatus,
      scheduledOnYmd: sched,
      calendarTimezone,
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
      const statusWithoutPersistedSchedule = promotedStatusForScheduledOnToday({
        currentStatus: status,
        scheduledOnYmd: null,
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
      setError(formatUserFacingError(cErr));
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
    const metaJson = JSON.stringify(metadataForSave);
    if (!o) {
      return (
        isCreateMode &&
        (title.trim().length > 0 ||
          itemType !== 'task' ||
          metaJson !== '{}' ||
          visibility !== 'private' ||
          assignedTo != null)
      );
    }
    return (
      title.trim() !== o.title ||
      (description ?? '').trim() !== (o.description ?? '').trim() ||
      status !== o.status ||
      priority !== o.priority ||
      sched !== (o.scheduledOn ?? null) ||
      (timeHm ?? null) !== (o.scheduledTime ?? null) ||
      itemType !== o.itemType ||
      metaJson !== o.metadataJson ||
      visibility !== o.visibility ||
      (assignedTo ?? null) !== (o.assignedTo ?? null)
    );
  }, [
    title,
    description,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    isCreateMode,
    itemType,
    metadataForSave,
    visibility,
    assignedTo,
  ]);

  if (!open) return null;

  const tabBtn = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        tab === id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );

  /* Task modal must sit above MobileTabBar (z-90) and drawer sheets (z-110–120) or actions are obscured on phones. */
  return (
    <>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
          <div className="flex items-start justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">{modalTitle}</h2>
              <p className="text-xs text-muted-foreground">{modalSubtitle}</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="border-b border-border px-6 py-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Type</p>
            <ItemTypeSelector value={itemType} onChange={setItemType} disabled={!canWrite} />
          </div>

          <div className="border-b border-border px-6 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Visibility</p>
              {hasWorkoutViewerContent ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setWorkoutViewerOpen(true)}
                >
                  <ListTree className="h-3 w-3 shrink-0" aria-hidden />
                  Workout viewer
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setVisibility('private')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === 'private'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <Lock className="size-4 shrink-0" aria-hidden />
                Private
              </button>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setVisibility('public')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  visibility === 'public'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <Globe className="size-4 shrink-0" aria-hidden />
                Public
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Public cards appear on your Astro storefront.
            </p>
            {(itemType === 'workout' || itemType === 'workout_log') &&
              workoutExercises.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Workout player</p>
                  <WorkoutPlayerTriggers
                    workoutTitle={title}
                    exercises={workoutExercises}
                    bubbleId={bubbleId ?? ''}
                    sourceTaskId={taskId}
                  />
                </div>
              )}
          </div>

          <div className="flex flex-wrap gap-2 border-b border-border px-6 py-2">
            {tabBtn('details', 'Details')}
            {tabBtn('comments', 'Comments')}
            {tabBtn('subtasks', 'Subtasks')}
            {tabBtn('activity', 'Activity')}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {error && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {loading && taskId ? (
              <p className="text-sm text-muted-foreground">Loading {typeNoun}…</p>
            ) : null}

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

                    {itemType === 'event' && (
                      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Event details</p>
                        <div className="space-y-2">
                          <Label htmlFor="task-event-location">Location</Label>
                          <Input
                            id="task-event-location"
                            value={eventLocation}
                            onChange={(e) => setEventLocation(e.target.value)}
                            disabled={!canWrite}
                            placeholder="e.g. Central Park"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="task-event-url">Meeting link</Label>
                          <Input
                            id="task-event-url"
                            type="url"
                            value={eventUrl}
                            onChange={(e) => setEventUrl(e.target.value)}
                            disabled={!canWrite}
                            placeholder="https://…"
                            className="h-9"
                          />
                        </div>
                      </div>
                    )}

                    {itemType === 'experience' && (
                      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Experience span</p>
                        <div className="space-y-2">
                          <Label htmlFor="task-experience-horizon">Season / label (optional)</Label>
                          <Input
                            id="task-experience-horizon"
                            value={experienceSeason}
                            onChange={(e) => setExperienceSeason(e.target.value)}
                            disabled={!canWrite}
                            placeholder="e.g. Summer 2026"
                            className="h-9"
                          />
                        </div>
                        <div className="flex flex-row flex-wrap gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <Label htmlFor="task-experience-start">Start date</Label>
                            <input
                              id="task-experience-start"
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
                            <Label htmlFor="task-experience-end">End date</Label>
                            <input
                              id="task-experience-end"
                              type="date"
                              value={experienceEndDate}
                              onChange={(e) => setExperienceEndDate(e.target.value)}
                              disabled={!canWrite}
                              className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Experiences appear as themed pills on their start date in the Month view.
                        </p>
                      </div>
                    )}

                    {itemType === 'memory' && (
                      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <Label htmlFor="task-memory-caption">Caption / reflection</Label>
                        <Textarea
                          id="task-memory-caption"
                          value={memoryCaption}
                          onChange={(e) => setMemoryCaption(e.target.value)}
                          disabled={!canWrite}
                          rows={3}
                          placeholder="What made this moment special?"
                        />
                        <p className="text-xs text-muted-foreground">
                          Photos and files go in Attachments below after you save.
                        </p>
                      </div>
                    )}

                    {(itemType === 'workout' || itemType === 'workout_log') && (
                      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {itemType === 'workout_log' ? 'Workout log' : 'Workout details'}
                          </p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {canWrite && (
                              <PremiumGate feature="ai" inline>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 gap-1 px-2 text-xs"
                                  disabled={aiWorkoutGenerating}
                                  onClick={() => void handleAiGenerateWorkout()}
                                >
                                  <Sparkles className="h-3 w-3" aria-hidden />
                                  {aiWorkoutGenerating ? 'Generating…' : 'AI workout'}
                                </Button>
                              </PremiumGate>
                            )}
                            {/* Template picker — only in create mode when templates exist */}
                            {!taskId && workoutTemplates.length > 0 && canWrite && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setTemplatePickerOpen((v) => !v)}
                                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                >
                                  Use template
                                  <ChevronDown
                                    className={cn(
                                      'h-3 w-3 shrink-0 transition-transform',
                                      templatePickerOpen && 'rotate-180',
                                    )}
                                  />
                                </button>
                                {templatePickerOpen && (
                                  <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                                    <ul className="max-h-48 overflow-y-auto py-1">
                                      {workoutTemplates.map((tpl) => {
                                        const tplFields = metadataFieldsFromParsed(tpl.metadata);
                                        return (
                                          <li key={tpl.id}>
                                            <button
                                              type="button"
                                              onClick={() => applyWorkoutTemplate(tpl)}
                                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
                                            >
                                              <span className="block font-medium">{tpl.title}</span>
                                              {tplFields.workoutType && (
                                                <span className="text-muted-foreground">
                                                  {tplFields.workoutType}
                                                  {tplFields.workoutDurationMin
                                                    ? ` · ${tplFields.workoutDurationMin} min`
                                                    : ''}
                                                </span>
                                              )}
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {aiWorkoutGenerating && (
                          <p className="text-xs text-muted-foreground">
                            {WORKOUT_FACTORY_CHAIN_MESSAGES[aiWorkoutProgressIdx]}
                          </p>
                        )}
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <Label htmlFor="task-workout-type">Type</Label>
                            <Input
                              id="task-workout-type"
                              value={workoutType}
                              onChange={(e) => setWorkoutType(e.target.value)}
                              disabled={!canWrite}
                              placeholder="e.g. Strength, Cardio, Yoga"
                              className="h-9"
                            />
                          </div>
                          <div className="w-28 space-y-2">
                            <Label htmlFor="task-workout-duration">Duration (min)</Label>
                            <Input
                              id="task-workout-duration"
                              type="number"
                              min={0}
                              value={workoutDurationMin}
                              onChange={(e) => setWorkoutDurationMin(e.target.value)}
                              disabled={!canWrite}
                              className="h-9"
                            />
                          </div>
                        </div>
                        <WorkoutExercisesEditor
                          exercises={workoutExercises}
                          onChange={setWorkoutExercises}
                          canWrite={canWrite}
                          workoutUnitSystem={workoutUnitSystem}
                          idPrefix="task-ex"
                        />
                      </div>
                    )}

                    {itemType === 'program' && (
                      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Program details
                          </p>
                          {canWrite && workspaceId && taskId ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={aiProgramPersonalizing}
                              onClick={() => void handlePersonalizeProgram()}
                            >
                              <Sparkles className="h-3 w-3" aria-hidden />
                              {aiProgramPersonalizing ? 'Personalizing…' : 'Personalize with AI'}
                            </Button>
                          ) : null}
                        </div>

                        {/* Goal */}
                        <div className="space-y-2">
                          <Label htmlFor="task-program-goal">Goal</Label>
                          <Input
                            id="task-program-goal"
                            value={programGoal}
                            onChange={(e) => setProgramGoal(e.target.value)}
                            disabled={!canWrite}
                            placeholder="e.g. Build lean muscle, Run a 5K"
                            className="h-9"
                          />
                        </div>

                        {/* Duration */}
                        <div className="w-36 space-y-2">
                          <Label htmlFor="task-program-duration">Duration (weeks)</Label>
                          <Input
                            id="task-program-duration"
                            type="number"
                            min={1}
                            value={programDurationWeeks}
                            onChange={(e) => setProgramDurationWeeks(e.target.value)}
                            disabled={!canWrite}
                            className="h-9"
                          />
                        </div>

                        {/* Progress (read-only) */}
                        {programCurrentWeek > 0 && programDurationWeeks && (
                          <p className="text-xs text-muted-foreground">
                            Progress: Week {programCurrentWeek} of {programDurationWeeks}
                          </p>
                        )}

                        {/* Weekly schedule summary */}
                        {programSchedule.length > 0 && programSchedule[0].days.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Weekly schedule
                            </p>
                            {programSchedule[0].days.map((d) => (
                              <p key={d.day} className="text-xs text-foreground">
                                <span className="font-medium">
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.day - 1]}
                                </span>
                                {' — '}
                                {d.name}
                                {d.workout_type ? ` (${d.workout_type})` : ''}
                                {d.duration_min ? ` · ${d.duration_min} min` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

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
                    {workspaceId ? (
                      <div className="space-y-2">
                        <Label htmlFor="task-assigned-to">Assigned to</Label>
                        <select
                          id="task-assigned-to"
                          value={assignedTo ?? ''}
                          onChange={(e) => setAssignedTo(e.target.value ? e.target.value : null)}
                          disabled={!canWrite}
                          className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                        >
                          <option value="">Unassigned</option>
                          {workspaceMembersForAssign.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Owner or member responsible for this card (including programs).
                        </p>
                      </div>
                    ) : null}
                    {itemType !== 'experience' && (
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
                    )}

                    <Separator className="my-2" />

                    <div className="space-y-2">
                      <Label>Attachments</Label>
                      {!isCreateMode && taskId && canWrite && (
                        <input
                          type="file"
                          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void uploadAttachment(f);
                          }}
                        />
                      )}
                      {isCreateMode && (
                        <p className="text-xs text-muted-foreground">
                          Save the {typeNoun} first, then you can upload files.
                        </p>
                      )}
                      <ul className="space-y-1">
                        {attachments.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              {isLikelyTaskAttachmentImageFileName(a.name) ? (
                                <TaskAttachmentImagePreview path={a.path} />
                              ) : null}
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate text-left text-primary hover:underline"
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
                                className="h-7 text-destructive hover:text-destructive"
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
                            {saving ? 'Creating…' : `Create ${typeNoun}`}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            disabled={saving || !coreDirty}
                            onClick={() => void saveCoreFields()}
                          >
                            {saving ? 'Saving…' : `Save ${typeNoun}`}
                          </Button>
                        )}
                      </div>
                    )}

                    {!isCreateMode && taskId && canWrite ? (
                      <>
                        <Separator className="my-4" />
                        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3">
                          <p className="mb-2 text-xs font-medium text-destructive">
                            Archive {typeNoun}
                          </p>
                          <p className="mb-3 text-xs text-muted-foreground">
                            Hides this {typeNoun} from the board and calendar. Recovery from archive
                            is not available in this version yet.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={archiving || saving || loading}
                            onClick={() => void archiveTask()}
                          >
                            {archiving ? 'Archiving…' : `Archive ${typeNoun}`}
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}

                {tab === 'comments' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {comments.length === 0 && (
                        <p className="text-sm text-muted-foreground">No comments yet.</p>
                      )}
                      <ul className="space-y-3">
                        {comments.map((c) => {
                          const author = commentUserById[c.user_id];
                          const displayName = author?.displayName ?? 'Member';
                          const avatarUrl = author?.avatarUrl ?? null;
                          return (
                            <li
                              key={c.id}
                              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"
                            >
                              <div className="flex gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/15 text-sm font-bold text-primary">
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
                                    <span className="font-bold text-foreground">{displayName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {formatMessageTimestamp(c.created_at)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 whitespace-pre-wrap text-foreground">
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
                      <p className="text-xs text-muted-foreground">
                        Create the {typeNoun} to add comments.
                      </p>
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
                            className="rounded border-input"
                          />
                          <span
                            className={
                              s.done ? 'text-muted-foreground line-through' : 'text-foreground'
                            }
                          >
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
                      <p className="text-xs text-muted-foreground">
                        Create the {typeNoun} to add subtasks.
                      </p>
                    )}
                  </div>
                )}

                {tab === 'activity' && (
                  <ul className="space-y-2">
                    {activityLog.length === 0 && (
                      <p className="text-sm text-muted-foreground">No activity yet.</p>
                    )}
                    {activityLog.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
                      >
                        <p>{formatActivityLine(e)}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
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
      <WorkoutViewerDialog
        open={workoutViewerOpen}
        onOpenChange={setWorkoutViewerOpen}
        workoutSet={viewerWorkoutSet}
        exercises={workoutExercises}
        title={title}
        description={description}
        canWrite={canWrite}
        workoutUnitSystem={workoutUnitSystem}
        onApply={handleWorkoutViewerApply}
      />
    </>
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
