'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import {
  normalizeItemType,
  type ItemType,
  type Json,
  type TaskRow,
  type TaskVisibility,
} from '@/types/database';
import { WorkoutViewerDialog } from '@/components/fitness/workout-viewer-dialog';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { type TaskAttachment, TASK_STATUSES } from '@/types/task-modal';
import { type TaskPriority, normalizeTaskPriority } from '@/lib/task-priority';
import { taskDateFieldLabels } from '@/lib/task-date-labels';
import type { WorkspaceCategory } from '@/types/database';
import { buildTaskAttachmentObjectPath, TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import { isLikelyTaskAttachmentImageFileName } from '@/lib/task-attachment-url';
import { TaskModalActivityPanel } from '@/components/modals/task-modal/TaskModalActivityPanel';
import { TaskModalAttachmentsSection } from '@/components/modals/task-modal/TaskModalAttachmentsSection';
import { TaskModalCardCoverSection } from '@/components/modals/task-modal/TaskModalCardCoverSection';
import { TaskModalItemMetadataSections } from '@/components/modals/task-modal/TaskModalItemMetadataSections';
import { TaskModalProgramFields } from '@/components/modals/task-modal/TaskModalProgramFields';
import { TaskModalWorkoutFields } from '@/components/modals/task-modal/TaskModalWorkoutFields';
import { TaskModalCommentsPanel } from '@/components/modals/task-modal/TaskModalCommentsPanel';
import { TaskModalDetailsFooterActions } from '@/components/modals/task-modal/TaskModalDetailsFooterActions';
import { TaskModalEditorChrome } from '@/components/modals/task-modal/TaskModalEditorChrome';
import { TaskModalSchedulingSection } from '@/components/modals/task-modal/TaskModalSchedulingSection';
import { TaskModalSubtasksPanel } from '@/components/modals/task-modal/TaskModalSubtasksPanel';
import { formatUserFacingError } from '@/lib/format-error';
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type ProgramWeek,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { useWorkoutTemplates } from '@/hooks/use-workout-templates';
import { scheduledTimeToInputValue } from '@/lib/task-scheduled-time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { indefiniteArticleForUiNoun, itemTypeUiNoun } from '@/lib/item-type-styles';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import { usePresenceStore } from '@/store/presenceStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { BubblyButton } from '@/components/tasks/bubbly-button';
import { TaskModalHero } from '@/components/modals/task-modal-hero';
import { useTaskLoadAndRealtime } from '@/components/modals/task-modal/hooks/useTaskLoadAndRealtime';
import { useWorkspaceAssignees } from '@/components/modals/task-modal/hooks/useWorkspaceAssignees';
import { useWorkoutUnitSystem } from '@/components/modals/task-modal/hooks/useWorkoutUnitSystem';
import { useTaskCardCoverAi } from '@/components/modals/task-modal/hooks/useTaskCardCoverAi';
import { useTaskProgramPersonalization } from '@/components/modals/task-modal/hooks/useTaskProgramPersonalization';
import { useTaskWorkoutAi } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import { useTaskOriginalSnapshot } from '@/components/modals/task-modal/hooks/useTaskOriginalSnapshot';
import { useTaskDirtyState } from '@/components/modals/task-modal/hooks/useTaskDirtyState';
import { useTaskEmbeddedCollections } from '@/components/modals/task-modal/hooks/useTaskEmbeddedCollections';
import { useTaskSaveAndCreate } from '@/components/modals/task-modal/hooks/useTaskSaveAndCreate';

export type TaskModalTab = 'details' | 'comments' | 'subtasks' | 'activity';

export type TaskModalViewMode = 'full' | 'comments-only';

export type OpenTaskOptions = {
  tab?: TaskModalTab;
  viewMode?: TaskModalViewMode;
  /** When true (e.g. Kanban pencil), workout cards open the first exercise row in edit mode immediately. */
  autoEdit?: boolean;
  /** When true (e.g. Kanban quick view), open the workout viewer after the task loads. */
  openWorkoutViewer?: boolean;
};

type TabId = TaskModalTab;

function normalizeTaskVisibility(value: unknown): TaskVisibility {
  return value === 'public' ? 'public' : 'private';
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
  /** When opening an existing task, controls inspector chrome (`comments-only` hides type / visibility / workout strip). */
  initialViewMode?: TaskModalViewMode;
  /** When true, workout / workout_log opens the exercise editor on the first row (Kanban pencil shortcut). */
  initialAutoEdit?: boolean;
  /** When true, open WorkoutViewerDialog once the task has viewer content (Kanban quick view). */
  initialOpenWorkoutViewer?: boolean;
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
  initialViewMode = 'full',
  initialAutoEdit = false,
  initialOpenWorkoutViewer = false,
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

  const workspaceMembersForAssign = useWorkspaceAssignees(open, workspaceId);

  const [tab, setTab] = useState<TabId>('details');
  const [viewMode, setViewMode] = useState<TaskModalViewMode>('full');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreateMode = open && !taskId && !!bubbleId;

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

  /** Program-specific fields. */
  const [programGoal, setProgramGoal] = useState('');
  const [programDurationWeeks, setProgramDurationWeeks] = useState('');
  const [programCurrentWeek, setProgramCurrentWeek] = useState(0);
  const [programSchedule, setProgramSchedule] = useState<ProgramWeek[]>([]);
  const [programSourceTitle, setProgramSourceTitle] = useState('');
  /** Storage path for optional Kanban/chat card header image (`metadata.card_cover_path`). */
  const [cardCoverPath, setCardCoverPath] = useState('');
  const [cardCoverAiHint, setCardCoverAiHint] = useState('');
  /** Empty string = server default scene by `item_type`. */
  const [cardCoverPresetId, setCardCoverPresetId] = useState('');
  const cardCoverFileInputRef = useRef<HTMLInputElement>(null);
  /** After the user uses editor chrome, collapse the 16:9 hero so Details has more vertical room. */
  const [heroCinematicCollapsed, setHeroCinematicCollapsed] = useState(false);

  const boardColumnDefs = useBoardColumnDefs(workspaceId);

  // Load workout templates when the user is composing a workout (create mode).
  const isWorkoutItemType = itemType === 'workout' || itemType === 'workout_log';
  const { templates: workoutTemplates } = useWorkoutTemplates(
    isWorkoutItemType && !taskId ? workspaceId : null,
  );

  const { workoutUnitSystem, setWorkoutUnitSystem } = useWorkoutUnitSystem(
    open,
    workspaceId,
    isWorkoutItemType,
  );

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

  const { originalRef, setOriginalFromAppliedRow, clearOriginal, patchOriginalMetadataJson } =
    useTaskOriginalSnapshot();

  const dateLabels = taskDateFieldLabels(workspaceCategory);

  const {
    templatePickerOpen,
    setTemplatePickerOpen,
    aiWorkoutGenerating,
    aiWorkoutProgressIdx,
    workoutViewerOpen,
    setWorkoutViewerOpen,
    applyWorkoutTemplate,
    handleAiGenerateWorkout,
    viewerWorkoutSet,
    hasWorkoutViewerContent,
    handleWorkoutViewerApply,
    resetWorkoutAiUi,
  } = useTaskWorkoutAi({
    open,
    taskId,
    loading,
    initialOpenWorkoutViewer,
    canWrite,
    workspaceId,
    isWorkoutItemType,
    title,
    workoutDurationMin,
    metadata,
    workoutExercises,
    setTitle,
    setDescription,
    setWorkoutType,
    setWorkoutDurationMin,
    setWorkoutExercises,
    setMetadata,
  });

  const { aiCardCoverGenerating, generateCardCoverWithAi, resetCardCoverAi } = useTaskCardCoverAi({
    canWrite,
    taskId,
    workspaceId,
    cardCoverAiHint,
    cardCoverPresetId,
    setCardCoverPath,
    setMetadata,
    setError,
    patchOriginalMetadataJson,
  });

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
          cardCoverPath,
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
      cardCoverPath,
      metadata,
    ],
  );

  const {
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
  } = useTaskEmbeddedCollections({
    taskId,
    canWrite,
    workspaceId,
    setError,
    setSaving,
  });

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
      setCardCoverPath(mf.cardCoverPath);
      hydrateFromTaskRow(row);
      const vis = normalizeTaskVisibility((row as TaskRow).visibility);
      setVisibility(vis);
      const assignee = (row as TaskRow).assigned_to ?? null;
      setAssignedTo(assignee);
      const st = scheduledTimeToInputValue((row as TaskRow).scheduled_time);
      setOriginalFromAppliedRow({
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
      });
    },
    [defaultStatus, hydrateFromTaskRow, setOriginalFromAppliedRow],
  );

  const onResetForCreate = useCallback(() => {
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
    resetWorkoutAiUi();
    setProgramGoal('');
    setProgramDurationWeeks('');
    setProgramCurrentWeek(0);
    setProgramSchedule([]);
    setProgramSourceTitle('');
    setCardCoverPath('');
    setCardCoverAiHint('');
    setCardCoverPresetId('');
    resetCardCoverAi();
    resetForCreate();
    setVisibility('private');
    setAssignedTo(null);
    clearOriginal();
    setError(null);
  }, [
    initialCreateItemType,
    initialCreateTitle,
    initialCreateWorkoutDurationMin,
    resetWorkoutAiUi,
    resetCardCoverAi,
    resetForCreate,
    clearOriginal,
  ]);

  const { loadTask } = useTaskLoadAndRealtime({
    open,
    taskId,
    applyRow,
    onResetForCreate,
    setLoading,
    setError,
  });

  const { aiProgramPersonalizing, handlePersonalizeProgram } = useTaskProgramPersonalization({
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
  });

  const { archiving, archiveTask, saveCoreFields, createTask } = useTaskSaveAndCreate({
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
  });

  const { coreDirty } = useTaskDirtyState({
    originalRef,
    isCreateMode,
    title,
    description,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    itemType,
    metadataForSave,
    visibility,
    assignedTo,
  });

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
    if (!open) return;
    if (!taskId) {
      setViewMode('full');
      setTab('details');
      return;
    }
    const vm = initialViewMode ?? 'full';
    setViewMode(vm);
    if (vm === 'comments-only' && initialTab == null) {
      setTab('comments');
    } else {
      setTab(initialTab ?? 'details');
    }
  }, [open, taskId, initialTab, initialViewMode]);

  useEffect(() => {
    setHeroCinematicCollapsed(false);
  }, [open, taskId, cardCoverPath]);

  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    setViewMode((prev) => (prev === 'comments-only' && id !== 'comments' ? 'full' : prev));
  }, []);

  /** Hero stays fixed above this pane; collapse the cinematic cover when the user scrolls the body. */
  const handleTaskModalBodyScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 8) {
      setHeroCinematicCollapsed(true);
    }
  }, []);

  const bubbleUpScopeTaskIds = useMemo(() => (taskId ? [taskId] : []), [taskId]);
  const { bubbleUpPropsFor } = useTaskBubbleUps(bubbleUpScopeTaskIds);
  const modalBubbleUp = taskId ? bubbleUpPropsFor(taskId) : undefined;

  const typeNoun = itemTypeUiNoun(itemType);
  const isExistingWorkoutCard = Boolean(
    taskId && (itemType === 'workout' || itemType === 'workout_log'),
  );
  /** Title-case for modal chrome; `itemTypeUiNoun` stays lowercase for in-flow copy (e.g. labels). */
  const modalTypeNoun =
    itemType === 'workout' ? 'Workout' : itemType === 'workout_log' ? 'Workout log' : typeNoun;
  const modalTitle = isCreateMode
    ? `New ${modalTypeNoun}`
    : isExistingWorkoutCard
      ? 'Workout Card'
      : `Edit ${modalTypeNoun}`;
  const modalSubtitle = isCreateMode
    ? `Create ${indefiniteArticleForUiNoun(modalTypeNoun)} ${modalTypeNoun} for this bubble`
    : isExistingWorkoutCard
      ? ''
      : `View and edit ${modalTypeNoun} details`;

  const uploadCardCover = async (file: File) => {
    if (!canWrite || !taskId) return;
    if (!isLikelyTaskAttachmentImageFileName(file.name)) {
      setError('Please choose an image file (PNG, JPG, WebP, GIF, …).');
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
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
    const previousPath = cardCoverPath.trim();
    const metaPayload = buildTaskMetadataPayload(
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
        cardCoverPath: path,
      },
      metadata,
    );
    const { error: uErr } = await supabase
      .from('tasks')
      .update({ metadata: metaPayload as TaskRow['metadata'] })
      .eq('id', taskId);
    setSaving(false);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      void supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([path]);
      return;
    }
    if (previousPath) {
      void supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([previousPath]);
    }
    setCardCoverPath(path);
    setMetadata(metaPayload);
    patchOriginalMetadataJson(JSON.stringify(metaPayload));
  };

  const removeCardCover = async () => {
    if (!canWrite || !taskId || !cardCoverPath.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const pathToRemove = cardCoverPath.trim();
    const metaPayload = buildTaskMetadataPayload(
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
        cardCoverPath: '',
      },
      metadata,
    );
    const { error: uErr } = await supabase
      .from('tasks')
      .update({ metadata: metaPayload as TaskRow['metadata'] })
      .eq('id', taskId);
    setSaving(false);
    if (uErr) {
      setError(formatUserFacingError(uErr));
      return;
    }
    void supabase.storage.from(TASK_ATTACHMENTS_BUCKET).remove([pathToRemove]);
    setCardCoverPath('');
    setMetadata(metaPayload);
    patchOriginalMetadataJson(JSON.stringify(metaPayload));
  };

  const downloadLink = async (att: TaskAttachment) => {
    const supabase = createClient();
    const { data, error: sErr } = await supabase.storage
      .from(TASK_ATTACHMENTS_BUCKET)
      .createSignedUrl(att.path, 3600);
    if (sErr || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (!open) return null;

  const showEditorChrome = !taskId || viewMode === 'full';

  const tabBtn = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => selectTab(id)}
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
        <div className="relative z-10 flex min-h-0 max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl">
          {taskId ? (
            <TaskModalHero
              title={title}
              description={description ?? ''}
              coverPath={cardCoverPath.trim() || null}
              onClose={() => onOpenChange(false)}
              compactCinematic={heroCinematicCollapsed}
            />
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">{modalTitle}</h2>
                {modalSubtitle ? (
                  <p className="text-xs text-muted-foreground">{modalSubtitle}</p>
                ) : null}
              </div>
              {!taskId ? (
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              ) : null}
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              onScroll={handleTaskModalBodyScroll}
            >
              <TaskModalEditorChrome
                showChrome={showEditorChrome}
                itemType={itemType}
                onItemTypeChange={setItemType}
                canWrite={canWrite}
                visibility={visibility}
                onVisibilityChange={setVisibility}
                hasWorkoutViewerContent={hasWorkoutViewerContent}
                onOpenWorkoutViewer={() => setWorkoutViewerOpen(true)}
                workoutTitle={title}
                workoutExercises={workoutExercises}
                bubbleId={bubbleId}
                workspaceId={workspaceId}
                taskId={taskId}
                onInteraction={() => setHeroCinematicCollapsed(true)}
              />

              <div className="px-6 pt-4 pb-4">
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

                        <TaskModalCardCoverSection
                          taskId={taskId}
                          cardCoverPath={cardCoverPath}
                          cardCoverFileInputRef={cardCoverFileInputRef}
                          onCardCoverFileChange={(f) => void uploadCardCover(f)}
                          onPickCardCover={() => cardCoverFileInputRef.current?.click()}
                          onRemoveCardCover={removeCardCover}
                          cardCoverPresetId={cardCoverPresetId}
                          onCardCoverPresetIdChange={setCardCoverPresetId}
                          cardCoverAiHint={cardCoverAiHint}
                          onCardCoverAiHintChange={setCardCoverAiHint}
                          canWrite={canWrite}
                          saving={saving}
                          aiCardCoverGenerating={aiCardCoverGenerating}
                          onGenerateCardCoverWithAi={generateCardCoverWithAi}
                        />

                        <TaskModalItemMetadataSections
                          itemType={itemType}
                          canWrite={canWrite}
                          eventLocation={eventLocation}
                          onEventLocationChange={setEventLocation}
                          eventUrl={eventUrl}
                          onEventUrlChange={setEventUrl}
                          experienceSeason={experienceSeason}
                          onExperienceSeasonChange={setExperienceSeason}
                          scheduledOn={scheduledOn}
                          onExperienceStartDateChange={(v) => {
                            setScheduledOn(v);
                            if (!v) setScheduledTime('');
                          }}
                          experienceEndDate={experienceEndDate}
                          onExperienceEndDateChange={setExperienceEndDate}
                          memoryCaption={memoryCaption}
                          onMemoryCaptionChange={setMemoryCaption}
                        />

                        {(itemType === 'workout' || itemType === 'workout_log') && (
                          <TaskModalWorkoutFields
                            itemType={itemType}
                            canWrite={canWrite}
                            taskId={taskId}
                            aiWorkoutGenerating={aiWorkoutGenerating}
                            aiWorkoutProgressIdx={aiWorkoutProgressIdx}
                            onAiGenerateWorkout={handleAiGenerateWorkout}
                            workoutTemplates={workoutTemplates}
                            templatePickerOpen={templatePickerOpen}
                            onTemplatePickerOpenChange={setTemplatePickerOpen}
                            onApplyWorkoutTemplate={applyWorkoutTemplate}
                            workoutType={workoutType}
                            onWorkoutTypeChange={setWorkoutType}
                            workoutDurationMin={workoutDurationMin}
                            onWorkoutDurationMinChange={setWorkoutDurationMin}
                            workoutExercises={workoutExercises}
                            onWorkoutExercisesChange={setWorkoutExercises}
                            workoutUnitSystem={workoutUnitSystem}
                            autoEditFirstRow={Boolean(
                              initialAutoEdit && isWorkoutItemType && taskId && canWrite,
                            )}
                          />
                        )}

                        {itemType === 'program' && (
                          <TaskModalProgramFields
                            canWrite={canWrite}
                            workspaceId={workspaceId}
                            taskId={taskId}
                            aiProgramPersonalizing={aiProgramPersonalizing}
                            onPersonalizeProgram={handlePersonalizeProgram}
                            programGoal={programGoal}
                            onProgramGoalChange={setProgramGoal}
                            programDurationWeeks={programDurationWeeks}
                            onProgramDurationWeeksChange={setProgramDurationWeeks}
                            programCurrentWeek={programCurrentWeek}
                            programSchedule={programSchedule}
                          />
                        )}

                        <TaskModalSchedulingSection
                          itemType={itemType}
                          dateLabels={dateLabels}
                          status={status}
                          onStatusChange={setStatus}
                          statusSelectOptions={statusSelectOptions}
                          priority={priority}
                          onPriorityChange={setPriority}
                          workspaceId={workspaceId}
                          assignedTo={assignedTo}
                          onAssignedToChange={setAssignedTo}
                          workspaceMembersForAssign={workspaceMembersForAssign}
                          scheduledOn={scheduledOn}
                          onScheduledOnChange={(v) => {
                            setScheduledOn(v);
                            if (!v) setScheduledTime('');
                          }}
                          scheduledTime={scheduledTime}
                          onScheduledTimeChange={setScheduledTime}
                          canWrite={canWrite}
                        />

                        <Separator className="my-2" />

                        <TaskModalAttachmentsSection
                          attachments={attachments}
                          isCreateMode={isCreateMode}
                          taskId={taskId}
                          canWrite={canWrite}
                          typeNoun={typeNoun}
                          onPickAttachmentFile={(f) => void uploadAttachment(f)}
                          onDownloadAttachment={downloadLink}
                          onRemoveAttachment={removeAttachment}
                        />

                        <TaskModalDetailsFooterActions
                          canWrite={canWrite}
                          isCreateMode={isCreateMode}
                          saving={saving}
                          title={title}
                          typeNoun={typeNoun}
                          coreDirty={coreDirty}
                          onCreateTask={createTask}
                          onSaveCoreFields={saveCoreFields}
                          taskId={taskId}
                          archiving={archiving}
                          loading={loading}
                          onArchiveTask={archiveTask}
                        />
                      </div>
                    )}

                    {tab === 'comments' && (
                      <TaskModalCommentsPanel
                        comments={comments}
                        commentUserById={commentUserById}
                        newComment={newComment}
                        onNewCommentChange={setNewComment}
                        onPostComment={addComment}
                        canWrite={canWrite}
                        taskId={taskId}
                        isCreateMode={isCreateMode}
                        typeNoun={typeNoun}
                      />
                    )}

                    {tab === 'subtasks' && (
                      <TaskModalSubtasksPanel
                        subtasks={subtasks}
                        newSubtaskTitle={newSubtaskTitle}
                        onNewSubtaskTitleChange={setNewSubtaskTitle}
                        onAddSubtask={addSubtask}
                        onToggleSubtask={toggleSubtask}
                        canWrite={canWrite}
                        taskId={taskId}
                        isCreateMode={isCreateMode}
                        typeNoun={typeNoun}
                      />
                    )}

                    {tab === 'activity' && <TaskModalActivityPanel activityLog={activityLog} />}
                  </>
                ) : null}
              </div>
            </div>

            <div
              className="shrink-0 border-t border-border bg-card px-6 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
              role="tablist"
              aria-label="Card sections"
            >
              <div className="flex flex-wrap items-center gap-2">
                {tabBtn('details', 'Details')}
                {tabBtn('comments', 'Comments')}
                {tabBtn('subtasks', 'Subtasks')}
                {tabBtn('activity', 'Activity')}
                {modalBubbleUp ? (
                  <BubblyButton {...modalBubbleUp} density="default" tabStrip />
                ) : null}
              </div>
            </div>
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
        cardCoverPath={cardCoverPath.trim() || null}
        taskId={taskId}
      />
    </>
  );
}
