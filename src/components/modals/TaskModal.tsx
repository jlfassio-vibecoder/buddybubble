'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import { ListTree, X } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { normalizeItemType } from '@/lib/item-types';
import type {
  BubbleRow,
  ItemType,
  Json,
  TaskRow,
  TaskVisibility,
  WorkspaceCategory,
} from '@/types/database';
import { WorkoutViewerContent } from '@/components/fitness/workout-viewer-dialog';
import { cn } from '@/lib/utils';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { type TaskAttachment, TASK_STATUSES } from '@/types/task-modal';
import { type TaskPriority, normalizeTaskPriority } from '@/lib/task-priority';
import { taskDateFieldLabels } from '@/lib/task-date-labels';
import { buildTaskAttachmentObjectPath, TASK_ATTACHMENTS_BUCKET } from '@/lib/task-storage';
import { isLikelyTaskAttachmentImageFileName } from '@/lib/task-attachment-url';
import { TaskModalActivityPanel } from '@/components/modals/task-modal/TaskModalActivityPanel';
import { TaskModalDetailsBody } from '@/components/modals/task-modal/TaskModalDetailsBody';
import {
  TaskModalCommentsPanel,
  type TaskModalCommentsPanelHandle,
} from '@/components/modals/task-modal/TaskModalCommentsPanel';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { isStandardTaskChatRailEnabled } from '@/lib/feature-flags/standardTaskChatRail';
import { TaskModalEditorChrome } from '@/components/modals/task-modal/TaskModalEditorChrome';
import { ClassEditor } from '@/components/modals/class-modal/ClassEditor';
import { TaskModalSubtasksPanel } from '@/components/modals/task-modal/TaskModalSubtasksPanel';
import { TaskModalTabBar } from '@/components/modals/task-modal/TaskModalTabBar';
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
import { toast } from 'sonner';
import { indefiniteArticleForUiNoun, itemTypeUiNoun } from '@/lib/item-type-styles';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';
import { ALL_BUBBLES_BUBBLE_ID } from '@/lib/all-bubbles';
import { usePresenceStore } from '@/store/presenceStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { TaskModalHero } from '@/components/modals/task-modal-hero';
import { TaskModalWorkoutHero } from '@/components/modals/task-modal-workout-hero';
import { WorkoutAiGenerateButton } from '@/components/modals/task-modal/workout-ai-generate-button';
import {
  useTaskLoadAndRealtime,
  type ApplyRowContext,
} from '@/components/modals/task-modal/hooks/useTaskLoadAndRealtime';
import { useWorkspaceAssignees } from '@/components/modals/task-modal/hooks/useWorkspaceAssignees';
import { useWorkoutUnitSystem } from '@/components/modals/task-modal/hooks/useWorkoutUnitSystem';
import { useTaskCardCoverAi } from '@/components/modals/task-modal/hooks/useTaskCardCoverAi';
import { useTaskProgramPersonalization } from '@/components/modals/task-modal/hooks/useTaskProgramPersonalization';
import {
  useTaskWorkoutAi,
  type WorkoutIntakeWizardData,
} from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';
import { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';
import { useTaskOriginalSnapshot } from '@/components/modals/task-modal/hooks/useTaskOriginalSnapshot';
import { useTaskCoreTextAutosave } from '@/components/modals/task-modal/hooks/useTaskCoreTextAutosave';
import { useTaskDirtyState } from '@/components/modals/task-modal/hooks/useTaskDirtyState';
import { useTaskEmbeddedCollections } from '@/components/modals/task-modal/hooks/useTaskEmbeddedCollections';
import { useTaskSaveAndCreate } from '@/components/modals/task-modal/hooks/useTaskSaveAndCreate';
import { useTaskCommentsViewedMarker } from '@/components/modals/task-modal/hooks/useTaskCommentsViewedMarker';
import { useTaskCommentMediaModal } from '@/components/modals/task-modal/hooks/useTaskCommentMediaModal';
import { useDraftCleanupOnClose } from '@/components/modals/task-modal/hooks/useDraftCleanupOnClose';
import { useTaskHardDelete } from '@/components/modals/task-modal/hooks/useTaskHardDelete';
import { mapAgentEffectTelemetryToRouting } from '@/components/modals/task-modal/mapAgentEffectTelemetryToRouting';
import type { TaskDraftBaseline } from '@/components/modals/task-modal/task-draft-types';
import { useIsNarrowBelowMd } from '@/hooks/use-is-narrow-below-md';
import type { TaskModalTab, TaskModalViewMode } from '@/types/open-task-options';
import type {
  AgentEffectTelemetryEvent,
  ExecutionPatchEffectPayload,
} from '@/components/chat/agent-effects/types';
import type { TaskModalIntakePatch } from '@/lib/agents/coach/task-modal-intake-patch';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import { defaultSlugForItemType } from '@/lib/agents/defaultSlugForItemType';
import { logAgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';
import { MessageMediaModal } from '@/components/chat/MessageMediaModal';
import { useUserProfileStore } from '@/store/userProfileStore';

export type { OpenTaskOptions, TaskModalTab, TaskModalViewMode } from '@/types/open-task-options';

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
  /** Workspace owner/admin — show Class in the type picker and mount `ClassEditor` for item type `class`. */
  canManageClasses?: boolean;
  /** When set with class flow, `ClassEditor` opens in edit mode for this `class_instances.id`. */
  classEditorInstanceId?: string | null;
  /** Called after a class is created from `ClassEditor` (not a `tasks` row). */
  onClassCreated?: (ids: { offeringId: string; instanceId: string }) => void;
  /** Called after a class is updated from `ClassEditor` (refresh lists). */
  onClassSaved?: () => void;
  /** Called after a task is created so the parent can keep the modal in edit mode. */
  onCreated?: (newTaskId: string) => void;
  /** Phase 3.8: opened from an optimistic `tasks` insert; cleared after first successful save. */
  isOptimisticDraft?: boolean;
  /** Baseline snapshot from optimistic insert; used for untouched auto-delete on close. */
  draftBaseline?: TaskDraftBaseline | null;
  /** Clear optimistic-draft shell state after the first successful save. */
  onOptimisticDraftConsumed?: () => void;
  /** After an untouched optimistic draft is auto-deleted on close (board refresh). */
  onOptimisticDraftAutoDeleted?: () => void;
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
  /** When true, open the unified workout pane once the task has viewer content (Kanban quick view). */
  initialOpenWorkoutViewer?: boolean;
  /** Task-scoped `messages.id` to auto-open that comment thread in Comments (root resolved from `parent_id`). */
  initialCommentThreadMessageId?: string | null;
  /** Drives Due by vs Scheduled on labels (`workspaces.category_type`). */
  workspaceCategory?: WorkspaceCategory | null;
  /** Workspace IANA timezone for scheduled-on vs calendar "today" (see `workspaces.calendar_timezone`). */
  calendarTimezone?: string | null;
  /** After a successful archive (existing task only); parent should refresh board/calendar lists. */
  onTaskArchived?: () => void;
  /** After the user views task comments long enough to record `user_task_views` (Kanban unread). */
  onTaskCommentsMarkedRead?: () => void;
  /**
   * After coach draft is applied and the modal navigates to Details: parent should clear
   * `initialCommentThreadMessageId` / `initialTab` / comments-only view mode from open options.
   * Otherwise those props survive across re-renders and the tab-sync layout effect can force
   * Comments again when the task row updates (realtime) or the shell re-renders.
   */
  onClearOpenTaskCommentDeepLink?: () => void;
  /** Bubbles in the active BuddyBubble — used for task-scoped comments (`useMessageThread`). */
  bubbles: BubbleRow[];
};

export function TaskModal({
  open,
  onOpenChange,
  taskId,
  bubbleId,
  workspaceId,
  canWrite,
  canManageClasses = false,
  classEditorInstanceId = null,
  onClassCreated,
  onClassSaved,
  onCreated,
  isOptimisticDraft: isOptimisticDraftProp = false,
  draftBaseline = null,
  onOptimisticDraftConsumed,
  onOptimisticDraftAutoDeleted,
  initialCreateStatus = null,
  initialCreateItemType = null,
  initialCreateTitle = null,
  initialCreateWorkoutDurationMin = null,
  initialTab = null,
  initialViewMode = 'full',
  initialAutoEdit = false,
  initialOpenWorkoutViewer = false,
  initialCommentThreadMessageId = null,
  workspaceCategory = null,
  calendarTimezone = null,
  onTaskArchived,
  onTaskCommentsMarkedRead,
  onClearOpenTaskCommentDeepLink,
  bubbles,
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
  /** Apply `initialTab` / comment deep-link routing once per `taskId` while open (see tab sync layout effect). */
  const appliedInitialTabForTaskIdRef = useRef<string | null>(null);
  /**
   * After `selectTab` runs (tab bar, coach draft handoff, etc.), never re-apply open-options tab
   * routing from props. Parent re-renders (e.g. bumpTaskViews ~1.5s after user_task_views debounce),
   * realtime, or `initial*` identity churn would otherwise re-run the layout effect and force
   * Comments while `initialCommentThreadMessageId` remains set.
   */
  const tabChoiceOwnedByUserRef = useRef(false);
  const lastTabSyncTaskIdRef = useRef<string | null>(null);
  /** When comments tab is showing a drilled-down thread (`TaskModalCommentsPanel`). */
  const [commentsInThreadView, setCommentsInThreadView] = useState(false);
  const commentsUnifiedScrollRef = useRef<HTMLDivElement>(null);
  const commentsPanelRef = useRef<TaskModalCommentsPanelHandle>(null);
  const myProfile = useUserProfileStore((s) => s.profile);
  const taskCommentMedia = useTaskCommentMediaModal();
  const [embeddedTaskIdsFromThread, setEmbeddedTaskIdsFromThread] = useState<string[]>([]);
  const standardRailEnabled = isStandardTaskChatRailEnabled();
  const isMdUp = !useIsNarrowBelowMd();
  const [composerPortalHost, setComposerPortalHost] = useState<HTMLDivElement | null>(null);
  /** Below `md`, which pane is visible when the workout split is open. */
  const [mobileUnifiedPane, setMobileUnifiedPane] = useState<'workout' | 'card'>('workout');
  const [workoutPaneSyncKey, setWorkoutPaneSyncKey] = useState(0);
  const prevWorkoutSplitRef = useRef(false);
  const [viewMode, setViewMode] = useState<TaskModalViewMode>('full');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreateMode = open && !taskId && !!bubbleId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);

  useEffect(() => {
    titleRef.current = title;
    descriptionRef.current = description;
  }, [title, description]);
  const [status, setStatus] = useState<string>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  /** YYYY-MM-DD for `<input type="date" />` or empty */
  const [scheduledOn, setScheduledOn] = useState('');
  /** `HH:mm` for `<input type="time" />` or empty (requires date) */
  const [scheduledTime, setScheduledTime] = useState('');
  const [itemType, setItemType] = useState<ItemType>('task');
  /**
   * Stable create-session id for the whole create flow (including after first save
   * `null -> taskId`); cleared when the modal closes. Drives `sessionKey` for the
   * workout intake wizard (Phase 3.6B C2).
   */
  const createSessionIdRef = useRef<string | null>(null);
  const handledIntakePatchMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    if (open) return;
    createSessionIdRef.current = null;
    handledIntakePatchMessageIdsByTaskRef.current.clear();
    setEmbeddedTaskIdsFromThread([]);
  }, [open]);

  const sessionKey = useMemo(() => {
    if (!open) return 'closed';
    if (createSessionIdRef.current) {
      return `create:${createSessionIdRef.current}`;
    }
    if (taskId) return `existing:${taskId}`;
    createSessionIdRef.current = crypto.randomUUID();
    return `create:${createSessionIdRef.current}`;
  }, [open, taskId]);

  const workoutIntake = useWorkoutIntakeWizardState(sessionKey);
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
  /** Card-based live video (`metadata.live_session`); class items use `ClassEditor` instead. */
  const [liveStreamEnabled, setLiveStreamEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (itemType === 'class' && !canManageClasses) {
      setItemType('task');
    }
  }, [open, itemType, canManageClasses]);

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

  const {
    originalRef,
    setOriginalFromAppliedRow,
    clearOriginal,
    patchOriginalMetadataJson,
    patchOriginalCoreText,
  } = useTaskOriginalSnapshot();

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
    description,
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

  const showWorkoutSplitPane = Boolean(
    open &&
    workoutViewerOpen &&
    isWorkoutItemType &&
    (hasWorkoutViewerContent || aiWorkoutGenerating),
  );

  const handleGenerateWorkoutFromComments = useCallback(() => {
    setWorkoutViewerOpen(true);
    void handleAiGenerateWorkout();
  }, [setWorkoutViewerOpen, handleAiGenerateWorkout]);

  const handleGenerateWorkoutFromIntake = useCallback(
    (wizardData: WorkoutIntakeWizardData) => {
      setWorkoutViewerOpen(true);
      void handleAiGenerateWorkout(wizardData);
    },
    [setWorkoutViewerOpen, handleAiGenerateWorkout],
  );

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
    (row: TaskRow, ctx: ApplyRowContext = { silent: false }) => {
      const silent = ctx.silent === true;
      const orig = originalRef.current;
      const titleDirty = silent && orig != null && titleRef.current.trim() !== orig.title;
      const descriptionDirty =
        silent &&
        orig != null &&
        (descriptionRef.current ?? '').trim() !== (orig.description ?? '').trim();

      if (!silent || !titleDirty) {
        setTitle(row.title);
      }
      if (!silent || !descriptionDirty) {
        setDescription(row.description ?? '');
      }
      const nextStatus = row.status || defaultStatus;
      const nextPriority = normalizeTaskPriority(row.priority);
      setStatus(nextStatus);
      setPriority(nextPriority);
      const sched = row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : '';
      setScheduledOn(sched);
      setScheduledTime(scheduledTimeToInputValue((row as TaskRow).scheduled_time));
      let nextItemType = normalizeItemType((row as TaskRow).item_type);
      if (nextItemType === 'class' && !canManageClasses) {
        nextItemType = 'task';
      }
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
      const assigneeRows = (row as TaskRow & { task_assignees?: { user_id: string }[] | null })
        .task_assignees;
      const assignee =
        assigneeRows?.find((r) => typeof r.user_id === 'string' && r.user_id.trim())?.user_id ??
        null;
      setAssignedTo(assignee);
      const liveInvite = parseLiveSessionInviteFromMessageMetadata((row as TaskRow).metadata);
      const nextLiveEnabled = Boolean(liveInvite && !liveInvite.endedAt);
      setLiveStreamEnabled(nextLiveEnabled);
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
        liveStreamEnabled: nextLiveEnabled,
      });
    },
    [canManageClasses, defaultStatus, hydrateFromTaskRow, setOriginalFromAppliedRow],
  );

  const onResetForCreate = useCallback(() => {
    setTab('details');
    let nextItemType = initialCreateItemType ?? 'task';
    if (nextItemType === 'class' && !canManageClasses) {
      nextItemType = 'task';
    }
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
    setLiveStreamEnabled(false);
    clearOriginal();
    setError(null);
  }, [
    canManageClasses,
    initialCreateItemType,
    initialCreateTitle,
    initialCreateWorkoutDurationMin,
    resetWorkoutAiUi,
    resetCardCoverAi,
    resetForCreate,
    clearOriginal,
  ]);

  const handleTaskRowDeleted = useCallback(() => {
    toast.error('This card was deleted or is no longer available.');
    onOpenChange(false);
  }, [onOpenChange]);

  const { loadTask } = useTaskLoadAndRealtime({
    open,
    taskId,
    applyRow,
    onResetForCreate,
    setLoading,
    setError,
    onTaskRowDeleted: handleTaskRowDeleted,
  });

  const { flushNow } = useTaskCoreTextAutosave({
    enabled: canWrite && Boolean(taskId),
    canWrite,
    taskId,
    title,
    description,
    originalRef,
    patchOriginalCoreText,
  });

  const handleOpenChange = useCallback(
    async (nextOpen: boolean) => {
      if (!nextOpen) {
        await flushNow();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, flushNow],
  );

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
    onOpenChange: handleOpenChange,
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
    liveStreamEnabled,
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

  const { hardDeleteTask } = useTaskHardDelete();

  const handleSaveCoreFields = useCallback(async () => {
    const ok = await saveCoreFields();
    if (ok && isOptimisticDraftProp) {
      onOptimisticDraftConsumed?.();
    }
  }, [saveCoreFields, isOptimisticDraftProp, onOptimisticDraftConsumed]);

  const handleModalHardDelete = useCallback(async () => {
    if (!taskId || !canWrite) return;
    await flushNow();
    await hardDeleteTask(taskId, { itemType });
    onOpenChange(false);
    onTaskArchived?.();
  }, [taskId, canWrite, itemType, hardDeleteTask, flushNow, onOpenChange, onTaskArchived]);

  useDraftCleanupOnClose({
    open,
    taskId,
    isOptimisticDraft: isOptimisticDraftProp && draftBaseline != null,
    baseline: draftBaseline,
    hardDeleteTask: async (id) => {
      await hardDeleteTask(id);
    },
    onUntouchedDraftDeleted: onOptimisticDraftAutoDeleted,
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
    liveStreamEnabled,
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

  useLayoutEffect(() => {
    if (!open) {
      appliedInitialTabForTaskIdRef.current = null;
      tabChoiceOwnedByUserRef.current = false;
      lastTabSyncTaskIdRef.current = null;
      return;
    }
    if (!taskId) {
      setViewMode('full');
      setTab('details');
      appliedInitialTabForTaskIdRef.current = null;
      tabChoiceOwnedByUserRef.current = false;
      lastTabSyncTaskIdRef.current = null;
      return;
    }

    // Switching to a different task while the modal stays open: allow initial routing again.
    if (lastTabSyncTaskIdRef.current !== null && lastTabSyncTaskIdRef.current !== taskId) {
      tabChoiceOwnedByUserRef.current = false;
      appliedInitialTabForTaskIdRef.current = null;
    }
    lastTabSyncTaskIdRef.current = taskId;

    // User explicitly chose a tab (or coach draft handoff) — do not override from props.
    if (tabChoiceOwnedByUserRef.current) {
      return;
    }

    // Apply open-options routing once per task until the user selects a tab (see ref above).
    if (appliedInitialTabForTaskIdRef.current === taskId) {
      return;
    }
    appliedInitialTabForTaskIdRef.current = taskId;

    const vm = initialViewMode ?? 'full';
    setViewMode(vm);
    if (initialCommentThreadMessageId?.trim()) {
      setTab('comments');
      return;
    }
    if (vm === 'comments-only' && initialTab == null) {
      setTab('comments');
      return;
    }
    setTab(initialTab ?? 'details');
  }, [open, taskId, initialTab, initialViewMode, initialCommentThreadMessageId]);

  useEffect(() => {
    if (tab !== 'comments') setCommentsInThreadView(false);
  }, [tab]);

  useEffect(() => {
    setCommentsInThreadView(false);
  }, [taskId]);

  useEffect(() => {
    if (!open) setCommentsInThreadView(false);
  }, [open]);

  useEffect(() => {
    setHeroCinematicCollapsed(false);
  }, [open, taskId, cardCoverPath]);

  useEffect(() => {
    if (showWorkoutSplitPane && !prevWorkoutSplitRef.current) {
      setWorkoutPaneSyncKey((k) => k + 1);
      setMobileUnifiedPane('workout');
    }
    prevWorkoutSplitRef.current = showWorkoutSplitPane;
  }, [showWorkoutSplitPane]);

  const selectTab = useCallback(
    async (id: TabId) => {
      if (id !== 'details') {
        await flushNow();
      }
      tabChoiceOwnedByUserRef.current = true;
      setTab(id);
      setViewMode((prev) => {
        if (id === 'comments' && taskId) return 'comments-only';
        if (prev === 'comments-only' && id !== 'comments') return 'full';
        return prev;
      });
    },
    [taskId, flushNow],
  );

  const handleCoachDraftFinalizeSuccess = useCallback(async () => {
    if (!taskId) return;
    commentsPanelRef.current?.exitThread();
    await selectTab('details');
    onClearOpenTaskCommentDeepLink?.();
    await loadTask(taskId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById('task-desc');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el instanceof HTMLElement) el.focus();
      });
    });
  }, [taskId, loadTask, onClearOpenTaskCommentDeepLink, selectTab]);

  /** Hero stays fixed above this pane; collapse the cinematic cover when the user scrolls the body. */
  const handleTaskModalBodyScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 8) {
      setHeroCinematicCollapsed(true);
    }
  }, []);

  const bubbleUpScopeTaskIds = useMemo(() => {
    if (!taskId) return [];
    return [...new Set([taskId, ...embeddedTaskIdsFromThread])];
  }, [taskId, embeddedTaskIdsFromThread]);
  const { bubbleUpPropsFor } = useTaskBubbleUps(bubbleUpScopeTaskIds);
  const modalBubbleUp = taskId ? bubbleUpPropsFor(taskId) : undefined;

  useTaskCommentsViewedMarker({
    enabled: open && Boolean(taskId) && standardRailEnabled,
    taskId,
    userId: myProfile?.id,
    onMarkedRead: onTaskCommentsMarkedRead,
  });

  const typeNoun = itemTypeUiNoun(itemType);
  /** Title-case for modal chrome; `itemTypeUiNoun` stays lowercase for in-flow copy (e.g. labels). */
  const modalTypeNoun =
    itemType === 'workout'
      ? 'Workout'
      : itemType === 'workout_log'
        ? 'Workout log'
        : itemType === 'class'
          ? 'Class'
          : typeNoun;
  const itemTypeNounLower = typeNoun.toLowerCase();

  let modalTitle: string;
  let modalSubtitle: string;
  if (isCreateMode) {
    modalTitle = `New ${modalTypeNoun}`;
    modalSubtitle = `Create ${indefiniteArticleForUiNoun(modalTypeNoun)} ${modalTypeNoun} for this bubble`;
  } else if (taskId) {
    if (tab === 'comments') {
      if (commentsInThreadView) {
        modalTitle = 'Replies';
        modalSubtitle = `Thread on this ${itemTypeNounLower}.`;
      } else {
        modalTitle = 'Comments';
        modalSubtitle = `Discuss this ${itemTypeNounLower}.`;
      }
    } else if (tab === 'subtasks') {
      modalTitle = 'Subtasks';
      modalSubtitle = `Break this ${itemTypeNounLower} down into smaller steps.`;
    } else if (tab === 'activity') {
      modalTitle = 'Activity Log';
      modalSubtitle = `History and updates for this ${itemTypeNounLower}.`;
    } else {
      modalTitle = `Edit ${modalTypeNoun}`;
      modalSubtitle = `View and edit ${modalTypeNoun} details`;
    }
  } else {
    modalTitle = `Edit ${modalTypeNoun}`;
    modalSubtitle = `View and edit ${modalTypeNoun} details`;
  }

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

  const taskModalChatCardWorkoutActions = useMemo(() => {
    if (!open || !taskId) return null;
    return {
      modalTaskId: taskId,
      onReviewDetails: () => void selectTab('details'),
      onGenerateWorkout:
        canWrite && itemType === 'workout' ? handleGenerateWorkoutFromComments : undefined,
      generateBusy: aiWorkoutGenerating,
    };
  }, [
    open,
    taskId,
    canWrite,
    itemType,
    selectTab,
    handleGenerateWorkoutFromComments,
    aiWorkoutGenerating,
  ]);

  const handleAgentEffectTelemetry = useCallback((e: AgentEffectTelemetryEvent) => {
    logAgentRoutingEvent(mapAgentEffectTelemetryToRouting(e));
  }, []);

  const handleExecutionPatch = useCallback(
    (_ctx: ExecutionPatchEffectPayload) => {
      if (!taskId) return;
      // Keep the details pane synchronized with agent-side task mutations emitted via
      // message metadata execution patches without forcing a loading-state flash.
      void loadTask(taskId, { silent: true });
    },
    [loadTask, taskId],
  );

  const buildStandardTaskChatRailOutgoingMetadata = useCallback(
    ({ content: _content, files: _files }: { content: string; files: File[] }) => {
      if (itemType !== 'workout' && itemType !== 'workout_log') return null;
      return {
        task_modal_live_state: {
          v: 1,
          item_type: itemType,
          wizard_step: workoutIntake.step,
          readiness: workoutIntake.readiness,
          sleep_quality: workoutIntake.sleepQuality,
          duration_minutes: workoutIntake.durationMinutes,
          target_intensity: workoutIntake.targetIntensity,
          soreness: workoutIntake.sorenessArray,
          equipment: workoutIntake.equipmentArray,
        },
      } as Record<string, Json>;
    },
    [
      itemType,
      workoutIntake.step,
      workoutIntake.readiness,
      workoutIntake.sleepQuality,
      workoutIntake.durationMinutes,
      workoutIntake.targetIntensity,
      workoutIntake.sorenessArray,
      workoutIntake.equipmentArray,
    ],
  );

  const handleTaskModalIntakePatch = useCallback(
    (args: {
      taskId: string;
      messageId: string;
      messageCreatedAtMs: number;
      patch: TaskModalIntakePatch;
    }) => {
      const dedupeKey = createSessionIdRef.current
        ? `create:${createSessionIdRef.current}`
        : `existing:${args.taskId}`;
      let set = handledIntakePatchMessageIdsByTaskRef.current.get(dedupeKey);
      if (!set) {
        set = new Set();
        handledIntakePatchMessageIdsByTaskRef.current.set(dedupeKey, set);
      }
      if (set.has(args.messageId)) return;
      set.add(args.messageId);
      workoutIntake.applyTaskModalIntakePatchFromMessage({
        patch: args.patch,
        messageId: args.messageId,
        messageCreatedAtMs: args.messageCreatedAtMs,
      });
    },
    [workoutIntake.applyTaskModalIntakePatchFromMessage],
  );

  const detailsBodyProps = useMemo(
    () => ({
      title,
      onTitleChange: setTitle,
      description,
      onDescriptionChange: setDescription,
      itemType,
      canWrite,
      onGenerateWorkoutFromIntake: handleGenerateWorkoutFromIntake,
      aiWorkoutGenerating,
      workoutIntakeState: itemType === 'workout' && canWrite ? workoutIntake : null,
      taskId,
      cardCoverPath,
      cardCoverFileInputRef,
      onCardCoverFileChange: (f: File) => void uploadCardCover(f),
      onPickCardCover: () => cardCoverFileInputRef.current?.click(),
      onRemoveCardCover: removeCardCover,
      cardCoverPresetId,
      onCardCoverPresetIdChange: setCardCoverPresetId,
      cardCoverAiHint,
      onCardCoverAiHintChange: setCardCoverAiHint,
      saving,
      aiCardCoverGenerating,
      onGenerateCardCoverWithAi: generateCardCoverWithAi,
      eventLocation,
      onEventLocationChange: setEventLocation,
      eventUrl,
      onEventUrlChange: setEventUrl,
      experienceSeason,
      onExperienceSeasonChange: setExperienceSeason,
      scheduledOn,
      onExperienceStartDateChange: (v: string) => {
        setScheduledOn(v);
        if (!v) setScheduledTime('');
      },
      experienceEndDate,
      onExperienceEndDateChange: setExperienceEndDate,
      memoryCaption,
      onMemoryCaptionChange: setMemoryCaption,
      aiWorkoutProgressIdx,
      onAiGenerateWorkout: handleAiGenerateWorkout,
      workoutTemplates,
      templatePickerOpen,
      onTemplatePickerOpenChange: setTemplatePickerOpen,
      onApplyWorkoutTemplate: applyWorkoutTemplate,
      workoutType,
      onWorkoutTypeChange: setWorkoutType,
      workoutDurationMin,
      onWorkoutDurationMinChange: setWorkoutDurationMin,
      workoutExercises,
      onWorkoutExercisesChange: setWorkoutExercises,
      workoutUnitSystem,
      initialAutoEdit,
      isWorkoutItemType,
      workspaceId,
      aiProgramPersonalizing,
      onPersonalizeProgram: handlePersonalizeProgram,
      programGoal,
      onProgramGoalChange: setProgramGoal,
      programDurationWeeks,
      onProgramDurationWeeksChange: setProgramDurationWeeks,
      programCurrentWeek,
      programSchedule,
      dateLabels,
      status,
      onStatusChange: setStatus,
      statusSelectOptions,
      priority,
      onPriorityChange: setPriority,
      assignedTo,
      onAssignedToChange: setAssignedTo,
      workspaceMembersForAssign,
      scheduledTime,
      onScheduledTimeChange: setScheduledTime,
      onScheduledOnChange: (v: string) => {
        setScheduledOn(v);
        if (!v) setScheduledTime('');
      },
      attachments,
      isCreateMode,
      typeNoun,
      onPickAttachmentFile: (f: File) => void uploadAttachment(f),
      onDownloadAttachment: downloadLink,
      onRemoveAttachment: removeAttachment,
      coreDirty,
      onCreateTask: createTask,
      onSaveCoreFields: handleSaveCoreFields,
      archiving,
      loading,
      onArchiveTask: archiveTask,
      onHardDeleteTask: handleModalHardDelete,
    }),
    [
      title,
      description,
      itemType,
      canWrite,
      handleGenerateWorkoutFromIntake,
      aiWorkoutGenerating,
      taskId,
      cardCoverPath,
      cardCoverFileInputRef,
      uploadCardCover,
      removeCardCover,
      cardCoverPresetId,
      cardCoverAiHint,
      saving,
      aiCardCoverGenerating,
      generateCardCoverWithAi,
      eventLocation,
      eventUrl,
      experienceSeason,
      scheduledOn,
      experienceEndDate,
      memoryCaption,
      aiWorkoutProgressIdx,
      handleAiGenerateWorkout,
      workoutTemplates,
      templatePickerOpen,
      applyWorkoutTemplate,
      workoutType,
      workoutDurationMin,
      workoutExercises,
      workoutUnitSystem,
      initialAutoEdit,
      isWorkoutItemType,
      workspaceId,
      aiProgramPersonalizing,
      handlePersonalizeProgram,
      programGoal,
      programDurationWeeks,
      programCurrentWeek,
      programSchedule,
      dateLabels,
      status,
      statusSelectOptions,
      priority,
      assignedTo,
      workspaceMembersForAssign,
      scheduledTime,
      attachments,
      isCreateMode,
      typeNoun,
      uploadAttachment,
      downloadLink,
      removeAttachment,
      coreDirty,
      createTask,
      handleSaveCoreFields,
      archiving,
      loading,
      archiveTask,
      handleModalHardDelete,
      workoutIntake,
    ],
  );

  if (!open) return null;

  const showClassEditorShell = itemType === 'class' && canManageClasses;
  if (showClassEditorShell) {
    const classShellTitle = classEditorInstanceId ? `Edit ${modalTypeNoun}` : modalTitle;
    const classShellSubtitle = classEditorInstanceId
      ? `Update the scheduled ${itemTypeNounLower} for this workspace`
      : modalSubtitle;

    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 max-md:p-0 max-md:items-stretch">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={() => handleOpenChange(false)}
        />
        <div
          className={cn(
            'relative z-10 flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl transition-[max-width] duration-200 ease-out',
            'max-md:flex-1 max-md:min-h-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-x-0 max-md:border-t-0',
            'md:max-h-[min(90dvh,100dvh)] md:max-w-2xl',
          )}
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-foreground">{classShellTitle}</h2>
              {classShellSubtitle ? (
                <p className="text-xs text-muted-foreground">{classShellSubtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
              onClick={() => handleOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <TaskModalEditorChrome
            showChrome
            showTypeAndVisibility
            itemType={itemType}
            onItemTypeChange={setItemType}
            canManageClasses={canManageClasses}
            canWrite={canWrite}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            workoutTitle={title}
            workoutMetadata={metadata}
            bubbleId={bubbleId}
            workspaceId={workspaceId}
            taskId={taskId}
            onInteraction={() => setHeroCinematicCollapsed(true)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">
            <ClassEditor
              layout="embedded"
              workspaceId={workspaceId}
              canWrite={canManageClasses}
              mode={classEditorInstanceId ? 'edit' : 'create'}
              instanceId={classEditorInstanceId ?? undefined}
              onCreated={(ids) => {
                onClassCreated?.(ids);
              }}
              onSaved={() => {
                onClassSaved?.();
              }}
              onClose={() => handleOpenChange(false)}
            />
          </div>
        </div>
      </div>
    );
  }

  const showEditorChrome = !taskId || viewMode === 'full';
  const commentsSplitLayout =
    standardRailEnabled && Boolean(taskId) && tab === 'comments' && isMdUp && !showWorkoutSplitPane;
  /** Hero + inspector tuned for reading workout context next to coach thread / comments-only. */
  const commentsReadingContext =
    Boolean(taskId) &&
    tab === 'comments' &&
    (viewMode === 'comments-only' || commentsInThreadView) &&
    !commentsSplitLayout;

  /** Chat-first layout: inner scroll lives in comments panel; outer body does not scroll. */
  const commentsChatLayout = Boolean(taskId) && tab === 'comments';
  /** Hero + messages share one scroll; composer portaled above tab bar (no workout split). */
  const useCommentsUnifiedLayout =
    commentsChatLayout && !showWorkoutSplitPane && !commentsSplitLayout;
  const commentsSlimWorkoutViewer =
    Boolean(taskId) && (hasWorkoutViewerContent || aiWorkoutGenerating) && isWorkoutItemType;
  const commentsSlimDetails = Boolean(taskId) && !commentsInThreadView && !hasWorkoutViewerContent;
  const showCommentsSlimActionRow =
    useCommentsUnifiedLayout && (commentsSlimWorkoutViewer || commentsSlimDetails);
  const unifiedThreadBack =
    useCommentsUnifiedLayout && commentsInThreadView && taskId
      ? () => commentsPanelRef.current?.exitThread()
      : undefined;

  /* Task modal must sit above MobileTabBar (z-90) and drawer sheets (z-110–120) or actions are obscured on phones. */
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 max-md:p-0 max-md:items-stretch">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => handleOpenChange(false)}
      />
      {/* QA: compact-path description bleed uses -mx-*; on mobile the shell is full-width so cinematic heroes need not rely on negative margins at the modal edge. */}
      <div
        className={cn(
          'relative z-10 flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl transition-[max-width] duration-200 ease-out',
          'max-md:flex-1 max-md:min-h-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-x-0 max-md:border-t-0',
          'md:max-h-[min(90dvh,100dvh)]',
          showWorkoutSplitPane || commentsSplitLayout ? 'max-w-6xl' : 'max-w-2xl',
        )}
      >
        {standardRailEnabled && open ? (
          <MessageMediaModal
            open={taskCommentMedia.mediaModal !== null}
            onOpenChange={taskCommentMedia.onMediaModalOpenChange}
            attachments={taskCommentMedia.mediaModal?.attachments ?? []}
            initialIndex={taskCommentMedia.mediaModal?.index ?? 0}
          />
        ) : null}
        {taskId && !showWorkoutSplitPane && !useCommentsUnifiedLayout ? (
          isWorkoutItemType ? (
            <TaskModalWorkoutHero
              title={title}
              description={description ?? ''}
              coverPath={cardCoverPath.trim() || null}
              onClose={() => handleOpenChange(false)}
              compactCinematic={commentsSplitLayout}
              descriptionExpanded={commentsReadingContext}
              descriptionCollapseMode={commentsReadingContext ? 'preview_toggle' : 'none'}
              readingContextActions={
                commentsReadingContext && itemType === 'workout' && canWrite ? (
                  <WorkoutAiGenerateButton
                    onClick={handleGenerateWorkoutFromComments}
                    busy={aiWorkoutGenerating}
                  />
                ) : null
              }
            />
          ) : (
            <TaskModalHero
              title={title}
              description={description ?? ''}
              coverPath={cardCoverPath.trim() || null}
              onClose={() => handleOpenChange(false)}
              compactCinematic={
                tab !== 'details' ||
                heroCinematicCollapsed ||
                commentsReadingContext ||
                commentsSplitLayout
              }
              descriptionExpanded={commentsReadingContext}
              descriptionCollapseMode={commentsReadingContext ? 'preview_toggle' : 'none'}
              readingContextActions={null}
            />
          )
        ) : null}

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            showWorkoutSplitPane && 'md:flex-row md:items-stretch',
          )}
        >
          {showWorkoutSplitPane ? (
            <div
              className="flex gap-1 border-b border-border bg-muted/40 px-2 py-2 md:hidden"
              role="tablist"
              aria-label="Workout or card"
            >
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md py-2 text-xs font-semibold transition-colors',
                  mobileUnifiedPane === 'workout'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/80',
                )}
                aria-pressed={mobileUnifiedPane === 'workout'}
                onClick={() => setMobileUnifiedPane('workout')}
              >
                Workout
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md py-2 text-xs font-semibold transition-colors',
                  mobileUnifiedPane === 'card'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/80',
                )}
                aria-pressed={mobileUnifiedPane === 'card'}
                onClick={() => setMobileUnifiedPane('card')}
              >
                Card
              </button>
            </div>
          ) : null}
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              showWorkoutSplitPane && mobileUnifiedPane === 'workout' && 'max-md:hidden',
              showWorkoutSplitPane && 'md:border-r md:border-border',
              /* Narrow rail for card + comments; workout pane takes remaining width (see sibling). */
              showWorkoutSplitPane &&
                'md:max-w-[min(38%,400px)] md:shrink-0 md:basis-[min(32%,340px)] md:grow-0 md:flex-none',
            )}
          >
            {useCommentsUnifiedLayout ? (
              <>
                <div
                  ref={standardRailEnabled ? undefined : commentsUnifiedScrollRef}
                  className={cn(
                    'flex min-h-0 flex-1 flex-col',
                    !standardRailEnabled && 'overflow-y-auto overscroll-contain',
                  )}
                  onScroll={!standardRailEnabled ? handleTaskModalBodyScroll : undefined}
                >
                  {taskId ? (
                    isWorkoutItemType ? (
                      <TaskModalWorkoutHero
                        title={title}
                        description={description ?? ''}
                        coverPath={cardCoverPath.trim() || null}
                        onClose={() => handleOpenChange(false)}
                        onBack={unifiedThreadBack}
                        descriptionExpanded={commentsReadingContext}
                        descriptionCollapseMode={commentsReadingContext ? 'preview_toggle' : 'none'}
                        readingContextActions={
                          commentsReadingContext && itemType === 'workout' && canWrite ? (
                            <WorkoutAiGenerateButton
                              onClick={handleGenerateWorkoutFromComments}
                              busy={aiWorkoutGenerating}
                            />
                          ) : null
                        }
                      />
                    ) : (
                      <TaskModalHero
                        title={title}
                        description={description ?? ''}
                        coverPath={cardCoverPath.trim() || null}
                        onClose={() => handleOpenChange(false)}
                        onBack={unifiedThreadBack}
                        compactCinematic={
                          heroCinematicCollapsed ||
                          commentsReadingContext ||
                          tab === 'comments' ||
                          tab === 'subtasks' ||
                          tab === 'activity'
                        }
                        descriptionExpanded={commentsReadingContext}
                        descriptionCollapseMode={commentsReadingContext ? 'preview_toggle' : 'none'}
                        readingContextActions={null}
                      />
                    )
                  ) : null}
                  {showCommentsSlimActionRow ? (
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border px-6 py-2">
                      {commentsSlimWorkoutViewer ? (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="gap-2 shadow-sm"
                          onClick={() => setWorkoutViewerOpen(true)}
                        >
                          <ListTree className="size-4 shrink-0" aria-hidden />
                          Workout viewer
                        </Button>
                      ) : null}
                      {commentsSlimDetails ? (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="shadow-sm"
                          onClick={() => void selectTab('details')}
                        >
                          Details
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="shrink-0">
                    <TaskModalEditorChrome
                      showChrome={showEditorChrome}
                      showTypeAndVisibility={showEditorChrome && !commentsReadingContext}
                      itemType={itemType}
                      onItemTypeChange={setItemType}
                      canManageClasses={canManageClasses}
                      canWrite={canWrite}
                      visibility={visibility}
                      onVisibilityChange={setVisibility}
                      liveStreamEnabled={liveStreamEnabled}
                      onLiveStreamEnabledChange={setLiveStreamEnabled}
                      workoutTitle={title}
                      workoutMetadata={metadata}
                      bubbleId={bubbleId}
                      workspaceId={workspaceId}
                      taskId={taskId}
                      onInteraction={() => setHeroCinematicCollapsed(true)}
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-2">
                    {error && (
                      <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </div>
                    )}
                    {loading && taskId ? (
                      <p className="text-sm text-muted-foreground">Loading {typeNoun}…</p>
                    ) : null}
                    {!loading || !taskId ? (
                      standardRailEnabled ? (
                        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                          <StandardTaskChatRail
                            key={taskId ?? 'create'}
                            workspaceId={workspaceId}
                            taskId={taskId!}
                            bubbleId={bubbleId ?? undefined}
                            canPostMessages={canWrite}
                            defaultAgentSlug={defaultSlugForItemType(itemType)}
                            buildOutgoingMessageMetadata={buildStandardTaskChatRailOutgoingMetadata}
                            transcriptFilter={(row) =>
                              row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT
                            }
                            initialCommentThreadMessageId={initialCommentThreadMessageId}
                            onThreadViewChange={setCommentsInThreadView}
                            onExecutionPatch={handleExecutionPatch}
                            onTaskModalIntakePatch={handleTaskModalIntakePatch}
                            onEffectTelemetry={handleAgentEffectTelemetry}
                            onEmbeddedTaskIdsChange={setEmbeddedTaskIdsFromThread}
                            chatRowExtras={{
                              onCoachDraftFinalizeSuccess: handleCoachDraftFinalizeSuccess,
                              chatCardWorkoutActions: taskModalChatCardWorkoutActions,
                              bubbleUpPropsFor: bubbleUpPropsFor,
                              onOpenAttachment: taskCommentMedia.onOpenAttachment,
                            }}
                          />
                        </div>
                      ) : (
                        <TaskModalCommentsPanel
                          ref={commentsPanelRef}
                          key={taskId ?? 'create'}
                          taskId={taskId!}
                          workspaceId={workspaceId}
                          bubbles={bubbles}
                          canWrite={canWrite}
                          taskBubbleIdHint={bubbleId}
                          initialCommentThreadMessageId={initialCommentThreadMessageId}
                          onThreadViewChange={setCommentsInThreadView}
                          onMarkedRead={onTaskCommentsMarkedRead}
                          showInlineGenerateWorkout={false}
                          onGenerateWorkout={handleGenerateWorkoutFromComments}
                          generateWorkoutBusy={aiWorkoutGenerating}
                          unifiedScrollLayout
                          composerPortalHost={composerPortalHost}
                          scrollContainerRef={commentsUnifiedScrollRef}
                          hideThreadBackRow
                          onCoachDraftFinalizeSuccess={handleCoachDraftFinalizeSuccess}
                          chatCardWorkoutActions={taskModalChatCardWorkoutActions}
                        />
                      )
                    ) : null}
                  </div>
                </div>
                {!standardRailEnabled ? (
                  <div
                    ref={(el) => setComposerPortalHost(el)}
                    className="relative shrink-0 border-t border-border bg-card"
                  />
                ) : null}
                <TaskModalTabBar
                  tab={tab}
                  onSelectTab={(id) => void selectTab(id)}
                  bubblyProps={modalBubbleUp ?? null}
                />
              </>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-foreground">{modalTitle}</h2>
                    {modalSubtitle ? (
                      <p className="text-xs text-muted-foreground">{modalSubtitle}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {taskId &&
                    (hasWorkoutViewerContent || aiWorkoutGenerating) &&
                    !showWorkoutSplitPane &&
                    isWorkoutItemType ? (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="gap-2 shadow-sm"
                        onClick={() => setWorkoutViewerOpen(true)}
                      >
                        <ListTree className="size-4 shrink-0" aria-hidden />
                        Workout viewer
                      </Button>
                    ) : null}
                    {taskId &&
                    tab === 'comments' &&
                    !commentsInThreadView &&
                    !showWorkoutSplitPane &&
                    !hasWorkoutViewerContent ? (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="shadow-sm"
                        onClick={() => void selectTab('details')}
                      >
                        Details
                      </Button>
                    ) : null}
                    {!taskId || showWorkoutSplitPane ? (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Close"
                        onClick={() => handleOpenChange(false)}
                      >
                        <X className="h-5 w-5" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div
                  className={cn(
                    commentsChatLayout
                      ? 'flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain'
                      : 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
                  )}
                  onScroll={
                    commentsChatLayout && !useCommentsUnifiedLayout
                      ? handleTaskModalBodyScroll
                      : undefined
                  }
                >
                  {commentsSplitLayout ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 md:flex-row md:items-stretch">
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:max-w-[min(42%,440px)] md:shrink-0 md:basis-[min(38%,400px)] md:grow-0 md:flex-none md:border-r md:border-border">
                          <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-2">
                            {error && (
                              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {error}
                              </div>
                            )}
                            {loading && taskId ? (
                              <p className="text-sm text-muted-foreground">Loading {typeNoun}…</p>
                            ) : null}
                            {!loading || !taskId ? (
                              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                                <StandardTaskChatRail
                                  key={taskId ?? 'create'}
                                  workspaceId={workspaceId}
                                  taskId={taskId!}
                                  bubbleId={bubbleId ?? undefined}
                                  canPostMessages={canWrite}
                                  defaultAgentSlug={defaultSlugForItemType(itemType)}
                                  buildOutgoingMessageMetadata={
                                    buildStandardTaskChatRailOutgoingMetadata
                                  }
                                  transcriptFilter={(row) =>
                                    row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT
                                  }
                                  initialCommentThreadMessageId={initialCommentThreadMessageId}
                                  onThreadViewChange={setCommentsInThreadView}
                                  onExecutionPatch={handleExecutionPatch}
                                  onTaskModalIntakePatch={handleTaskModalIntakePatch}
                                  onEffectTelemetry={handleAgentEffectTelemetry}
                                  onEmbeddedTaskIdsChange={setEmbeddedTaskIdsFromThread}
                                  chatRowExtras={{
                                    onCoachDraftFinalizeSuccess: handleCoachDraftFinalizeSuccess,
                                    chatCardWorkoutActions: taskModalChatCardWorkoutActions,
                                    bubbleUpPropsFor: bubbleUpPropsFor,
                                    onOpenAttachment: taskCommentMedia.onOpenAttachment,
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div
                          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-4 pb-4"
                          data-testid="task-modal-comments-split-details-pane"
                        >
                          {loading && taskId ? (
                            <p className="text-sm text-muted-foreground">Loading {typeNoun}…</p>
                          ) : null}
                          {!loading || !taskId ? (
                            <TaskModalDetailsBody {...detailsBodyProps} />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="shrink-0">
                        <TaskModalEditorChrome
                          showChrome={showEditorChrome}
                          showTypeAndVisibility={showEditorChrome && !commentsReadingContext}
                          itemType={itemType}
                          onItemTypeChange={setItemType}
                          canManageClasses={canManageClasses}
                          canWrite={canWrite}
                          visibility={visibility}
                          onVisibilityChange={setVisibility}
                          liveStreamEnabled={liveStreamEnabled}
                          onLiveStreamEnabledChange={setLiveStreamEnabled}
                          workoutTitle={title}
                          workoutMetadata={metadata}
                          bubbleId={bubbleId}
                          workspaceId={workspaceId}
                          taskId={taskId}
                          onInteraction={() => setHeroCinematicCollapsed(true)}
                        />
                      </div>

                      <div
                        className={cn(
                          'px-6 pt-4',
                          commentsChatLayout ? 'flex min-h-0 flex-1 flex-col pb-0' : 'pb-4',
                        )}
                      >
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
                            {tab === 'details' && <TaskModalDetailsBody {...detailsBodyProps} />}

                            {tab === 'comments' &&
                              (taskId ? (
                                <div className="flex min-h-0 flex-1 flex-col">
                                  {standardRailEnabled ? (
                                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                                      <StandardTaskChatRail
                                        key={taskId ?? 'create'}
                                        workspaceId={workspaceId}
                                        taskId={taskId}
                                        bubbleId={bubbleId ?? undefined}
                                        canPostMessages={canWrite}
                                        defaultAgentSlug={defaultSlugForItemType(itemType)}
                                        buildOutgoingMessageMetadata={
                                          buildStandardTaskChatRailOutgoingMetadata
                                        }
                                        transcriptFilter={(row) =>
                                          row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT
                                        }
                                        initialCommentThreadMessageId={
                                          initialCommentThreadMessageId
                                        }
                                        onThreadViewChange={setCommentsInThreadView}
                                        onExecutionPatch={handleExecutionPatch}
                                        onTaskModalIntakePatch={handleTaskModalIntakePatch}
                                        onEffectTelemetry={handleAgentEffectTelemetry}
                                        onEmbeddedTaskIdsChange={setEmbeddedTaskIdsFromThread}
                                        chatRowExtras={{
                                          onCoachDraftFinalizeSuccess:
                                            handleCoachDraftFinalizeSuccess,
                                          chatCardWorkoutActions: taskModalChatCardWorkoutActions,
                                          bubbleUpPropsFor: bubbleUpPropsFor,
                                          onOpenAttachment: taskCommentMedia.onOpenAttachment,
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <TaskModalCommentsPanel
                                      ref={commentsPanelRef}
                                      key={taskId ?? 'create'}
                                      taskId={taskId}
                                      workspaceId={workspaceId}
                                      bubbles={bubbles}
                                      canWrite={canWrite}
                                      taskBubbleIdHint={bubbleId}
                                      initialCommentThreadMessageId={initialCommentThreadMessageId}
                                      onThreadViewChange={setCommentsInThreadView}
                                      onMarkedRead={onTaskCommentsMarkedRead}
                                      showInlineGenerateWorkout={
                                        Boolean(showWorkoutSplitPane) &&
                                        itemType === 'workout' &&
                                        canWrite
                                      }
                                      onGenerateWorkout={handleGenerateWorkoutFromComments}
                                      generateWorkoutBusy={aiWorkoutGenerating}
                                      onMessagesScroll={
                                        commentsChatLayout && !useCommentsUnifiedLayout
                                          ? handleTaskModalBodyScroll
                                          : undefined
                                      }
                                      onCoachDraftFinalizeSuccess={handleCoachDraftFinalizeSuccess}
                                      chatCardWorkoutActions={taskModalChatCardWorkoutActions}
                                    />
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Create the {typeNoun} to add comments.
                                </p>
                              ))}

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

                            {tab === 'activity' && (
                              <TaskModalActivityPanel activityLog={activityLog} />
                            )}
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

                <TaskModalTabBar
                  tab={tab}
                  onSelectTab={(id) => void selectTab(id)}
                  bubblyProps={modalBubbleUp ?? null}
                />
              </>
            )}
          </div>
          {showWorkoutSplitPane ? (
            <div
              className={cn(
                'flex min-h-0 flex-col md:min-h-0 md:min-w-0 md:flex-1',
                mobileUnifiedPane === 'workout'
                  ? 'max-md:flex max-md:flex-1 max-md:min-h-0'
                  : 'max-md:hidden',
                'md:flex',
              )}
            >
              <WorkoutViewerContent
                workoutSet={viewerWorkoutSet}
                exercises={workoutExercises}
                title={title}
                description={description}
                canWrite={canWrite}
                workoutUnitSystem={workoutUnitSystem}
                onApply={handleWorkoutViewerApply}
                onRequestClose={() => setWorkoutViewerOpen(false)}
                syncKey={workoutPaneSyncKey}
                cardCoverPath={cardCoverPath.trim() || null}
                taskId={taskId}
                layout="embedded"
                isAiGenerating={aiWorkoutGenerating}
                cardCoverAiHint={cardCoverAiHint}
                onCardCoverAiHintChange={setCardCoverAiHint}
                cardCoverPresetId={cardCoverPresetId}
                onCardCoverPresetIdChange={setCardCoverPresetId}
                aiCardCoverGenerating={aiCardCoverGenerating}
                onGenerateCardCoverWithAi={generateCardCoverWithAi}
                showInlineCardCoverAi={Boolean(
                  taskId && canWrite && (itemType === 'workout' || itemType === 'workout_log'),
                )}
                cardCoverSaveBusy={saving}
                {...(canWrite
                  ? {
                      onSaveTask: () => {
                        void (taskId ? handleSaveCoreFields() : createTask());
                      },
                      saving,
                      saveDisabled: taskId ? !coreDirty : !title.trim(),
                    }
                  : {})}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
