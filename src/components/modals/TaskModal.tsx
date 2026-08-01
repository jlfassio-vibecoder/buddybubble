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
import { usePathname, useRouter } from 'next/navigation';
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
import {
  WorkoutViewerContent,
  type WorkoutViewerApplyPayload,
  type WorkoutViewerCanvasDraftHandle,
} from '@/components/fitness/workout-viewer-dialog';
import { mapCoachProposedToCanvasBlocks } from '@/lib/agents/coach/coach-block-mapper';
import {
  resolveStructuralEffectApplyGate,
  shouldClaimStructuralEffectAfterApply,
} from '@/lib/agents/coach/structural-effect-claim';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { useActiveSessionLaunchFromTaskModal } from '@/hooks/use-active-session-launch-from-task-modal';
import { buildActiveSessionUrl } from '@/lib/active-session/build-active-session-url';
import { cn } from '@/lib/utils';
import {
  isWorkoutLogInProgress,
  readWorkoutLogSourceTaskId,
  WORKOUT_LOG_IN_PROGRESS_STATUS,
  workoutLogInProgressStatusSelectOption,
} from '@/lib/workout-log-task-state';
import { isActiveSessionRouteEnabled } from '@/lib/feature-flags/activeSessionRoute';
import { WorkoutPlayer } from '@/components/fitness/WorkoutPlayer';
import { WorkoutLogInProgressBadge } from '@/components/tasks/WorkoutLogInProgressBadge';
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
import {
  StandardTaskChatRail,
  type StandardTaskChatRailHandle,
} from '@/components/chat/StandardTaskChatRail';
import { isStandardTaskChatRailEnabled } from '@/lib/feature-flags/standardTaskChatRail';
import { isWorkoutBuilderRouteEnabled } from '@/lib/feature-flags/workoutBuilderRoute';
import { buildWorkoutBuilderUrl } from '@/lib/workout-builder/build-workout-builder-url';
import { TaskModalEditorChrome } from '@/components/modals/task-modal/TaskModalEditorChrome';
import { TaskModalCoverHeader } from '@/components/modals/task-modal/TaskModalCoverHeader';
import { ClassEditor } from '@/components/modals/class-modal/ClassEditor';
import { ManageClassRosterModal } from '@/components/modals/ManageClassRosterModal';
import { TaskModalClassRsvpCanvas } from '@/components/modals/task-modal/TaskModalClassRsvpCanvas';
import { TaskModalDetailsStickyFooter } from '@/components/modals/task-modal/TaskModalDetailsStickyFooter';
import { TaskModalSubtasksPanel } from '@/components/modals/task-modal/TaskModalSubtasksPanel';
import { TaskModalTabBar } from '@/components/modals/task-modal/TaskModalTabBar';
import { formatUserFacingError } from '@/lib/format-error';
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type MemoryMomentReaction,
  type ProgramWeek,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import { stampUserFields } from '@/lib/task-field-provenance';
import { detectUserDemotedProvenanceKeys } from '@/lib/task-field-provenance-demote';
import { toggleIdeaVote } from '@/lib/idea-vote';
import { useWorkoutTemplates } from '@/hooks/use-workout-templates';
import { getExercisesFromWorkout } from '@/lib/workout-factory/program-schedule-utils';
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
import { useWorkoutOutlineEditor } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';
import { useTaskOriginalSnapshot } from '@/components/modals/task-modal/hooks/useTaskOriginalSnapshot';
import { useTaskCoreTextAutosave } from '@/components/modals/task-modal/hooks/useTaskCoreTextAutosave';
import { useTaskDirtyState } from '@/components/modals/task-modal/hooks/useTaskDirtyState';
import { useTaskEmbeddedCollections } from '@/components/modals/task-modal/hooks/useTaskEmbeddedCollections';
import {
  useTaskSaveAndCreate,
  type SaveCoreFieldsOptions,
} from '@/components/modals/task-modal/hooks/useTaskSaveAndCreate';
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
  CardActionEffectPayload,
  ExecutionPatchEffectPayload,
  OutlineDraftAppliedEffectPayload,
  ProposedWorkoutMetadataEffectPayload,
  StructuralPatchEffectPayload,
  WorkoutCuesPatchEffectPayload,
} from '@/components/chat/agent-effects/types';
import type { ExerciseCueRequestV1 } from '@/lib/agents/coach/exercise-cue-request';
import { stripWorkoutCuesPatchToCuePatch } from '@/components/chat/agent-effects/parse-workout-cues-patch-fields';
import { useFitnessProfileInjuries } from '@/components/modals/task-modal/hooks/useFitnessProfileInjuries';
import type { TaskModalIntakePatch } from '@/lib/agents/coach/task-modal-intake-patch';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import { defaultSlugForItemType } from '@/lib/agents/defaultSlugForItemType';
import { logAgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';
import { buildTaskModalOutgoingWorkoutContext } from '@/lib/agents/coach/task-modal-outgoing-workout-context';
import { buildTaskModalOutlineDraftPayload } from '@/lib/agents/coach/build-outline-draft-context';
import { readCoachOutlineMetadata } from '@/lib/agents/coach/coach-outline-metadata';
import {
  buildSessionReadinessContext,
  mergeSessionReadinessIntoMetadata,
} from '@/lib/workout-factory/session-readiness-context';
import {
  generationIntakeContextToDailyCheckin,
  buildGenerationIntakeContext,
} from '@/lib/workout-factory/generation-intake-context';
import { pickWorkoutIntakePanelWizardProps } from '@/components/fitness/workout-intake/pick-workout-intake-panel-props';
import { WorkoutPreflightReadinessDialog } from '@/components/fitness/workout-intake/WorkoutPreflightReadinessDialog';
import { normalizeOutlineDraft } from '@/lib/agents/coach/outline-editor-client';
import {
  applyWorkoutPlayerExecutionPatchIfOpen,
  executionPatchFingerprint,
} from '@/lib/workout-player-execution-patch-bridge';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import {
  clearPendingWorkoutCuesSatisfiedByIncoming,
  reconcileWorkoutCueMetadata,
  snapshotPendingWorkoutCuePatches,
  type PendingWorkoutCueEntry,
} from '@/lib/workout-factory/reconcile-workout-cue-metadata';
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
  /** Called after a class is created from `ClassEditor` (includes parent `tasks` canvas id). */
  onClassCreated?: (ids: { offeringId: string; instanceId: string; taskId: string }) => void;
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
  const workoutBuilderRouteEnabled = isWorkoutBuilderRouteEnabled();
  const router = useRouter();
  const pathname = usePathname();
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
  const [continueSessionPlayerOpen, setContinueSessionPlayerOpen] = useState(false);
  const [continueSessionBusy, setContinueSessionBusy] = useState(false);
  /** Source workout row for in-progress log → V1 player (matches dashboard-shell). */
  const [sourceWorkoutLaunch, setSourceWorkoutLaunch] = useState<{
    id: string;
    title: string;
    metadata: Json;
    bubbleId: string;
  } | null>(null);
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
  const handledOutlineAppliedMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());
  /** Survives StandardTaskChatRail remounts when workout split layout toggles (Phase 12.2). */
  const handledCardActionMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());
  const handledWorkoutCuesPatchMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());
  const handledStructuralPatchMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(new Map());
  const handledProposedWorkoutMetadataMessageIdsByTaskRef = useRef<Map<string, Set<string>>>(
    new Map(),
  );
  /** Pending Coach cue patches awaiting Realtime confirmation (messageId → entry). */
  const pendingWorkoutCuesByMessageRef = useRef<Map<string, PendingWorkoutCueEntry>>(new Map());
  const cueStaleRefetchScheduledRef = useRef(false);
  const loadTaskRef = useRef<
    ((id: string, opts?: { silent?: boolean }) => Promise<TaskRow | null>) | null
  >(null);
  const chatRailRef = useRef<StandardTaskChatRailHandle | null>(null);
  const canvasDraftRef = useRef<WorkoutViewerCanvasDraftHandle | null>(null);
  /**
   * Coach open of the workout pane: skip the false→true syncKey bump so hard-reset cannot
   * undo a structural/proposed apply that child effects already ran this turn.
   */
  const skipNextWorkoutPaneSyncBumpRef = useRef(false);
  /** Pending Coach canvas apply: missing handle, or structural refuse while dirty. */
  const pendingCanvasCoachOpRef = useRef<
    | {
        kind: 'structural';
        taskId: string;
        messageId: string;
        patches: StructuralPatchEffectPayload['patches'];
      }
    | {
        kind: 'proposed';
        messageId: string;
        proposed: ProposedWorkoutMetadataEffectPayload['proposed'];
      }
    | null
  >(null);
  /** Tracks embedded canvas dirtiness so pending Coach patches can flush after Apply/Discard. */
  const [canvasDraftIsDirty, setCanvasDraftIsDirty] = useState(false);
  const handledExecutionPatchFingerprintByTaskRef = useRef<Map<string, Map<string, string>>>(
    new Map(),
  );
  /** Keeps workout split engaged after card_action so failed generation does not collapse the rail layout. */
  const [workoutSplitEngaged, setWorkoutSplitEngaged] = useState(false);

  useEffect(() => {
    if (open) return;
    createSessionIdRef.current = null;
    handledIntakePatchMessageIdsByTaskRef.current.clear();
    handledOutlineAppliedMessageIdsByTaskRef.current.clear();
    handledCardActionMessageIdsByTaskRef.current.clear();
    handledWorkoutCuesPatchMessageIdsByTaskRef.current.clear();
    handledStructuralPatchMessageIdsByTaskRef.current.clear();
    handledProposedWorkoutMetadataMessageIdsByTaskRef.current.clear();
    pendingWorkoutCuesByMessageRef.current.clear();
    pendingCanvasCoachOpRef.current = null;
    skipNextWorkoutPaneSyncBumpRef.current = false;
    cueStaleRefetchScheduledRef.current = false;
    handledExecutionPatchFingerprintByTaskRef.current.clear();
    setWorkoutSplitEngaged(false);
    setEmbeddedTaskIdsFromThread([]);
  }, [open]);

  useEffect(() => {
    pendingWorkoutCuesByMessageRef.current.clear();
    pendingCanvasCoachOpRef.current = null;
    cueStaleRefetchScheduledRef.current = false;
  }, [taskId]);

  const sessionKey = useMemo(() => {
    if (!open) return 'closed';
    if (createSessionIdRef.current) {
      return `create:${createSessionIdRef.current}`;
    }
    if (taskId) return `existing:${taskId}`;
    createSessionIdRef.current = crypto.randomUUID();
    return `create:${createSessionIdRef.current}`;
  }, [open, taskId]);

  const [preflightCompletedThisOpen, setPreflightCompletedThisOpen] = useState(false);
  const [preflightDialogOpen, setPreflightDialogOpen] = useState(false);
  const [visibility, setVisibility] = useState<TaskVisibility>('private');
  /** Workspace member user id, or null = unassigned */
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Json>({});
  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const hasWorkoutFactory = readCoachOutlineMetadata(metadata).hasFactory;
  const intakeMode = hasWorkoutFactory ? 'preflight' : 'generation';
  const workoutIntake = useWorkoutIntakeWizardState(sessionKey, {}, { mode: intakeMode });
  const buildWizardPayload = workoutIntake.buildWizardPayload;

  const generationLiveState = useMemo(
    () =>
      generationIntakeContextToDailyCheckin(
        buildGenerationIntakeContext({
          durationMinutes: workoutIntake.durationMinutes,
          phaseIntent: workoutIntake.phaseIntent,
          progressionTrend: workoutIntake.progressionTrend,
          anchorLiftName: workoutIntake.anchorLiftName,
          anchorLiftWeight: workoutIntake.anchorLiftWeight,
          anchorLiftReps: workoutIntake.anchorLiftReps,
          temporaryLimitations: workoutIntake.temporaryLimitations,
        }),
      ),
    [
      workoutIntake.durationMinutes,
      workoutIntake.phaseIntent,
      workoutIntake.progressionTrend,
      workoutIntake.anchorLiftName,
      workoutIntake.anchorLiftWeight,
      workoutIntake.anchorLiftReps,
      workoutIntake.temporaryLimitations,
    ],
  );

  const workoutIntakePanelProps = useMemo(() => {
    if (itemType !== 'workout' || !canWrite) return null;
    return pickWorkoutIntakePanelWizardProps(workoutIntake);
  }, [
    itemType,
    canWrite,
    workoutIntake.step,
    workoutIntake.readiness,
    workoutIntake.sleepQuality,
    workoutIntake.durationMinutes,
    workoutIntake.phaseIntent,
    workoutIntake.sorenessArray,
    workoutIntake.progressionTrend,
    workoutIntake.anchorLiftName,
    workoutIntake.anchorLiftWeight,
    workoutIntake.anchorLiftReps,
    workoutIntake.temporaryLimitations,
    workoutIntake.setStep,
    workoutIntake.setReadiness,
    workoutIntake.setSleepQuality,
    workoutIntake.setDurationMinutes,
    workoutIntake.setPhaseIntent,
    workoutIntake.toggleSoreness,
    workoutIntake.setProgressionTrend,
    workoutIntake.setAnchorLiftName,
    workoutIntake.setAnchorLiftWeight,
    workoutIntake.setAnchorLiftReps,
    workoutIntake.setTemporaryLimitations,
    workoutIntake.durationOptions,
    workoutIntake.phaseIntentOptions,
    workoutIntake.progressionTrendOptions,
    workoutIntake.sorenessOptions,
  ]);

  const [eventLocation, setEventLocation] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [eventBring, setEventBring] = useState<string[]>([]);
  const [eventGoing, setEventGoing] = useState('');
  const [eventCapacity, setEventCapacity] = useState('');
  const [eventGoingPeople, setEventGoingPeople] = useState<string[]>([]);
  const [experienceSeason, setExperienceSeason] = useState('');
  /** YYYY-MM-DD experience span end (`metadata.end_date`). */
  const [experienceEndDate, setExperienceEndDate] = useState('');
  const [experienceHighlights, setExperienceHighlights] = useState<string[]>([]);
  const [experienceIncludes, setExperienceIncludes] = useState<string[]>([]);
  const [experienceGoodFor, setExperienceGoodFor] = useState<string[]>([]);
  const [experienceLocation, setExperienceLocation] = useState('');
  const [experienceDurationMin, setExperienceDurationMin] = useState('');
  const [experiencePrice, setExperiencePrice] = useState('');
  const [experienceGroupMin, setExperienceGroupMin] = useState('');
  const [experienceGroupMax, setExperienceGroupMax] = useState('');
  const [memoryCaption, setMemoryCaption] = useState('');
  const [memoryPeople, setMemoryPeople] = useState<string[]>([]);
  const [memoryLinkedEvent, setMemoryLinkedEvent] = useState('');
  const [memoryReactions, setMemoryReactions] = useState<MemoryMomentReaction[]>([]);
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
  /** Idea: interest votes (`metadata.votes` / `metadata.voted_by`). */
  const [ideaVotes, setIdeaVotes] = useState(0);
  const [ideaVotedBy, setIdeaVotedBy] = useState<string[]>([]);
  const [ideaVoteBusy, setIdeaVoteBusy] = useState(false);
  const [cardCoverAiHint, setCardCoverAiHint] = useState('');
  /** Empty string = server default scene by `item_type`. */
  const [cardCoverPresetId, setCardCoverPresetId] = useState('');
  const cardCoverFileInputRef = useRef<HTMLInputElement>(null);
  /** After the user uses editor chrome, collapse the 16:9 hero so Details has more vertical room. */
  const [heroCinematicCollapsed, setHeroCinematicCollapsed] = useState(false);
  /** Card-based live video (`metadata.live_session`); class items use `ClassEditor` instead. */
  const [liveStreamEnabled, setLiveStreamEnabled] = useState(false);
  const [classRosterModalOpen, setClassRosterModalOpen] = useState(false);
  const [classRosterCapacity, setClassRosterCapacity] = useState<number | null>(null);

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
  const injuriesOnFile = useFitnessProfileInjuries(open, workspaceId, isWorkoutItemType);

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
    originalSnapshot,
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
    computeWorkoutViewerApplyMetadata,
    handleWorkoutViewerCuePatches,
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

  useEffect(() => {
    if (!open || !taskId || !initialOpenWorkoutViewer || loading) return;
    setWorkoutSplitEngaged(true);
  }, [open, taskId, initialOpenWorkoutViewer, loading]);

  const showWorkoutSplitPane = Boolean(
    open &&
    workoutViewerOpen &&
    isWorkoutItemType &&
    (hasWorkoutViewerContent || aiWorkoutGenerating || workoutSplitEngaged),
  );

  const workoutHashExerciseNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (name: string) => {
      const t = name.trim();
      const k = t.toLowerCase();
      if (!t || seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    for (const e of workoutExercises) {
      add(e.name);
    }
    const firstSession = viewerWorkoutSet?.workouts?.[0];
    if (firstSession) {
      for (const ex of getExercisesFromWorkout(firstSession)) {
        add(ex.exerciseName);
      }
    }
    return out;
  }, [workoutExercises, viewerWorkoutSet]);

  const handleGenerateWorkoutFromComments = useCallback(() => {
    setWorkoutSplitEngaged(true);
    setWorkoutViewerOpen(true);
    void handleAiGenerateWorkout();
  }, [setWorkoutViewerOpen, handleAiGenerateWorkout]);

  const handleGenerateWorkoutFromIntake = useCallback(
    (wizardData: WorkoutIntakeWizardData) => {
      setWorkoutSplitEngaged(true);
      setWorkoutViewerOpen(true);
      void handleAiGenerateWorkout(wizardData);
    },
    [setWorkoutViewerOpen, handleAiGenerateWorkout],
  );

  const handleOpenWorkoutViewerFromDetails = useCallback(() => {
    setWorkoutSplitEngaged(true);
    setWorkoutViewerOpen(true);
  }, [setWorkoutViewerOpen]);

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

  const formFieldsForProvenance = useMemo(
    () => ({
      eventLocation,
      eventUrl,
      eventBring,
      eventGoing,
      eventCapacity,
      eventGoingPeople,
      experienceSeason,
      experienceEndDate,
      experienceHighlights,
      experienceIncludes,
      experienceGoodFor,
      experienceLocation,
      experienceDurationMin,
      experiencePrice,
      experienceGroupMin,
      experienceGroupMax,
      memoryCaption,
      memoryPeople,
      memoryLinkedEvent,
      memoryReactions,
      workoutType,
      workoutDurationMin,
      workoutExercises,
      programGoal,
      programDurationWeeks,
      programCurrentWeek,
      programSchedule,
      programSourceTitle,
      cardCoverPath,
      ideaVotes,
      ideaVotedBy,
    }),
    [
      eventLocation,
      eventUrl,
      eventBring,
      eventGoing,
      eventCapacity,
      eventGoingPeople,
      experienceSeason,
      experienceEndDate,
      experienceHighlights,
      experienceIncludes,
      experienceGoodFor,
      experienceLocation,
      experienceDurationMin,
      experiencePrice,
      experienceGroupMin,
      experienceGroupMax,
      memoryCaption,
      memoryPeople,
      memoryLinkedEvent,
      memoryReactions,
      workoutType,
      workoutDurationMin,
      workoutExercises,
      programGoal,
      programDurationWeeks,
      programCurrentWeek,
      programSchedule,
      programSourceTitle,
      cardCoverPath,
      ideaVotes,
      ideaVotedBy,
    ],
  );

  const userDemotedProvenanceKeys = useMemo(() => {
    return detectUserDemotedProvenanceKeys({
      itemType,
      fields: formFieldsForProvenance,
      title,
      description,
      original: originalSnapshot,
    });
  }, [itemType, formFieldsForProvenance, title, description, originalSnapshot]);

  const metadataForSave = useMemo(() => {
    const built = buildTaskMetadataPayload(itemType, formFieldsForProvenance, metadata);
    const demoteKeys = detectUserDemotedProvenanceKeys({
      itemType,
      fields: formFieldsForProvenance,
      title,
      description,
      original: originalSnapshot,
    });
    if (demoteKeys.length === 0) return built;
    return stampUserFields(built, demoteKeys) as typeof built;
  }, [itemType, formFieldsForProvenance, metadata, title, description, originalSnapshot]);

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
    if (
      status === WORKOUT_LOG_IN_PROGRESS_STATUS &&
      !statusOptions.some((o) => o.value === status)
    ) {
      return [...statusOptions, workoutLogInProgressStatusSelectOption()];
    }
    if (status && !statusOptions.some((o) => o.value === status)) {
      return [...statusOptions, { value: status, label: status }];
    }
    return statusOptions;
  }, [statusOptions, status]);

  const workoutLogInProgressHeroBadge = useMemo(() => {
    if (!isWorkoutLogInProgress({ item_type: itemType, status })) return null;
    return (
      <WorkoutLogInProgressBadge task={{ item_type: itemType, status }} variant="modal-hero" />
    );
  }, [itemType, status]);

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
      const preserveLocalRichWorkout =
        silent &&
        hasRichWorkoutSetInMetadata(metadataRef.current) &&
        !hasRichWorkoutSetInMetadata(nextMeta);

      let metaToApply = nextMeta;
      if (preserveLocalRichWorkout) {
        metaToApply = parseTaskMetadata(metadataRef.current);
      } else if (silent) {
        const pending = snapshotPendingWorkoutCuePatches(pendingWorkoutCuesByMessageRef.current);
        const reconciled = reconcileWorkoutCueMetadata({
          local: metadataRef.current as Json,
          incoming: nextMeta as Json,
          pending,
        });
        metaToApply = parseTaskMetadata(reconciled.metadata);
        clearPendingWorkoutCuesSatisfiedByIncoming(
          pendingWorkoutCuesByMessageRef.current,
          nextMeta as Json,
        );
        if (
          reconciled.pendingStillMissing &&
          pendingWorkoutCuesByMessageRef.current.size > 0 &&
          !cueStaleRefetchScheduledRef.current &&
          taskId
        ) {
          cueStaleRefetchScheduledRef.current = true;
          const id = taskId;
          queueMicrotask(() => {
            void loadTaskRef.current?.(id, { silent: true });
          });
        }
        if (!reconciled.pendingStillMissing) {
          cueStaleRefetchScheduledRef.current = false;
        }
      }

      setItemType(nextItemType);
      setMetadata(metaToApply);
      const mf = metadataFieldsFromParsed(metaToApply);
      setEventLocation(mf.eventLocation);
      setEventUrl(mf.eventUrl);
      setEventBring(mf.eventBring);
      setEventGoing(mf.eventGoing);
      setEventCapacity(mf.eventCapacity);
      setEventGoingPeople(mf.eventGoingPeople);
      setExperienceSeason(mf.experienceSeason);
      setExperienceEndDate(mf.experienceEndDate);
      setExperienceHighlights(mf.experienceHighlights);
      setExperienceIncludes(mf.experienceIncludes);
      setExperienceGoodFor(mf.experienceGoodFor);
      setExperienceLocation(mf.experienceLocation);
      setExperienceDurationMin(mf.experienceDurationMin);
      setExperiencePrice(mf.experiencePrice);
      setExperienceGroupMin(mf.experienceGroupMin);
      setExperienceGroupMax(mf.experienceGroupMax);
      setMemoryCaption(mf.memoryCaption);
      setMemoryPeople(mf.memoryPeople);
      setMemoryLinkedEvent(mf.memoryLinkedEvent);
      setMemoryReactions(mf.memoryReactions);
      setWorkoutType(mf.workoutType);
      setWorkoutDurationMin(mf.workoutDurationMin);
      setWorkoutExercises(mf.workoutExercises);
      setProgramGoal(mf.programGoal);
      setProgramDurationWeeks(mf.programDurationWeeks);
      setProgramCurrentWeek(mf.programCurrentWeek);
      setProgramSchedule(mf.programSchedule);
      setProgramSourceTitle(mf.programSourceTitle);
      setCardCoverPath(mf.cardCoverPath);
      setIdeaVotes(mf.ideaVotes);
      setIdeaVotedBy(mf.ideaVotedBy);
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
        metadataJson: JSON.stringify(buildTaskMetadataPayload(nextItemType, mf, metaToApply)),
        visibility: vis,
        assignedTo: assignee,
        liveStreamEnabled: nextLiveEnabled,
      });
    },
    [canManageClasses, defaultStatus, hydrateFromTaskRow, setOriginalFromAppliedRow, taskId],
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
    setEventBring([]);
    setEventGoing('');
    setEventCapacity('');
    setEventGoingPeople([]);
    setExperienceSeason('');
    setExperienceEndDate('');
    setExperienceHighlights([]);
    setExperienceIncludes([]);
    setExperienceGoodFor([]);
    setExperienceLocation('');
    setExperienceDurationMin('');
    setExperiencePrice('');
    setExperienceGroupMin('');
    setExperienceGroupMax('');
    setMemoryCaption('');
    setMemoryPeople([]);
    setMemoryLinkedEvent('');
    setMemoryReactions([]);
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
    setIdeaVotes(0);
    setIdeaVotedBy([]);
    setIdeaVoteBusy(false);
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
  loadTaskRef.current = loadTask;

  const handleCardAction = useCallback(
    (args: CardActionEffectPayload) => {
      if (
        args.action.kind !== 'trigger_generation' &&
        args.action.kind !== 'regenerate_from_outline'
      ) {
        return;
      }
      if (itemType !== 'workout') return;
      if (!canWrite) return;
      if (aiWorkoutGenerating) return;
      if (args.action.kind === 'trigger_generation' && viewerWorkoutSet != null) return;

      const dedupeKey = createSessionIdRef.current
        ? `create:${createSessionIdRef.current}`
        : `existing:${args.taskId}`;
      let handled = handledCardActionMessageIdsByTaskRef.current.get(dedupeKey);
      if (!handled) {
        handled = new Set();
        handledCardActionMessageIdsByTaskRef.current.set(dedupeKey, handled);
      }
      if (handled.has(args.messageId)) return;
      handled.add(args.messageId);

      logAgentRoutingEvent({
        event: 'coach.card_action.triggered',
        action: args.action.kind,
        taskId: args.taskId,
        messageId: args.messageId,
        surface: 'standard-task-chat-rail',
      });
      setWorkoutSplitEngaged(true);
      setWorkoutViewerOpen(true);

      void (async () => {
        let metadataForGeneration: Json | undefined;
        if (args.action.kind === 'regenerate_from_outline' && taskId) {
          const row = await loadTask(taskId, { silent: true });
          metadataForGeneration = row?.metadata ?? undefined;
        }
        await handleAiGenerateWorkout(
          buildWizardPayload(),
          metadataForGeneration != null ? { metadata: metadataForGeneration } : undefined,
        );
      })();
    },
    [
      itemType,
      canWrite,
      aiWorkoutGenerating,
      viewerWorkoutSet,
      setWorkoutViewerOpen,
      handleAiGenerateWorkout,
      buildWizardPayload,
      taskId,
      loadTask,
    ],
  );

  const handleWorkoutCuesPatch = useCallback(
    (args: WorkoutCuesPatchEffectPayload) => {
      if (itemType !== 'workout' || !canWrite) return;
      const dedupeKey = createSessionIdRef.current
        ? `create:${createSessionIdRef.current}`
        : `existing:${args.taskId}`;
      let handled = handledWorkoutCuesPatchMessageIdsByTaskRef.current.get(dedupeKey);
      if (!handled) {
        handled = new Set();
        handledWorkoutCuesPatchMessageIdsByTaskRef.current.set(dedupeKey, handled);
      }
      if (handled.has(args.messageId)) return;
      handled.add(args.messageId);

      const cuePatch = stripWorkoutCuesPatchToCuePatch(args.patch);
      pendingWorkoutCuesByMessageRef.current.set(args.messageId, {
        resolution_key: args.patch.resolution_key,
        patch: cuePatch,
        at: Date.now(),
      });
      cueStaleRefetchScheduledRef.current = false;

      // Optimistic local apply only — do not patch the saved baseline until DB/Realtime confirms.
      handleWorkoutViewerCuePatches({
        [args.patch.resolution_key]: cuePatch,
      });

      setWorkoutSplitEngaged(true);
      setWorkoutViewerOpen(true);
      setMobileUnifiedPane('workout');
    },
    [itemType, canWrite, handleWorkoutViewerCuePatches, setWorkoutViewerOpen],
  );

  const openWorkoutCanvasPane = useCallback(() => {
    setWorkoutSplitEngaged(true);
    setWorkoutViewerOpen(true);
    setMobileUnifiedPane('workout');
  }, [setWorkoutViewerOpen]);

  /** Coach effect path: open pane without the hard-reset syncKey bump that races child applies. */
  const openWorkoutCanvasPaneForCoach = useCallback(() => {
    skipNextWorkoutPaneSyncBumpRef.current = true;
    openWorkoutCanvasPane();
  }, [openWorkoutCanvasPane]);

  const coachEffectDedupeKey = useCallback((taskIdForEffect: string) => {
    return createSessionIdRef.current
      ? `create:${createSessionIdRef.current}`
      : `existing:${taskIdForEffect}`;
  }, []);

  const isCoachEffectMessageClaimed = useCallback(
    (map: Map<string, Set<string>>, taskIdForEffect: string, messageId: string): boolean => {
      const dedupeKey = coachEffectDedupeKey(taskIdForEffect);
      return map.get(dedupeKey)?.has(messageId) ?? false;
    },
    [coachEffectDedupeKey],
  );

  const claimCoachEffectMessageId = useCallback(
    (map: Map<string, Set<string>>, taskIdForEffect: string, messageId: string): boolean => {
      const dedupeKey = coachEffectDedupeKey(taskIdForEffect);
      let handled = map.get(dedupeKey);
      if (!handled) {
        handled = new Set();
        map.set(dedupeKey, handled);
      }
      if (handled.has(messageId)) return false;
      handled.add(messageId);
      return true;
    },
    [coachEffectDedupeKey],
  );

  const applyCoachStructuralToHandle = useCallback(
    (
      handle: WorkoutViewerCanvasDraftHandle,
      patches: StructuralPatchEffectPayload['patches'],
    ): boolean => {
      if (handle.mode !== 'edit') {
        handle.enterEdit();
      }
      const applied = handle.applyStructuralPatch(patches);
      if (applied) {
        toast.success('Coach updated your canvas');
        return true;
      }
      // Non–coach-notes ops still need a pristine draft; coach_notes apply while dirty.
      if (handle.mode === 'edit' && handle.isDirty) {
        toast.message('Coach has an update', {
          id: 'coach-dirty-draft-update',
          description: 'Apply or discard your canvas edits to load Coach’s changes.',
        });
      }
      return false;
    },
    [],
  );

  const applyCoachProposedToHandle = useCallback(
    (
      handle: WorkoutViewerCanvasDraftHandle,
      proposed: ProposedWorkoutMetadataEffectPayload['proposed'],
    ) => {
      const blocks = mapCoachProposedToCanvasBlocks({
        proposed,
        baseMetadata: metadata,
      });
      if (blocks.length === 0) return;

      if (handle.mode === 'edit' && handle.isDirty) {
        toast.message('Coach has an update', {
          id: 'coach-dirty-draft-update',
          description: 'Apply or discard your canvas edits to load Coach’s changes.',
        });
        return;
      }
      if (handle.mode !== 'edit') {
        handle.enterEdit();
      }
      const applied = handle.applyExternalBlocks(blocks);
      if (applied) {
        toast.success('Coach updated your canvas');
      }
    },
    [metadata],
  );

  const handleProposedWorkoutMetadata = useCallback(
    (args: ProposedWorkoutMetadataEffectPayload) => {
      if (itemType !== 'workout' || !canWrite) return;
      if (
        !claimCoachEffectMessageId(
          handledProposedWorkoutMetadataMessageIdsByTaskRef.current,
          args.taskId,
          args.messageId,
        )
      ) {
        return;
      }

      openWorkoutCanvasPaneForCoach();
      const handle = canvasDraftRef.current;
      if (!handle) {
        pendingCanvasCoachOpRef.current = {
          kind: 'proposed',
          messageId: args.messageId,
          proposed: args.proposed,
        };
        return;
      }
      pendingCanvasCoachOpRef.current = null;
      applyCoachProposedToHandle(handle, args.proposed);
    },
    [
      itemType,
      canWrite,
      claimCoachEffectMessageId,
      openWorkoutCanvasPaneForCoach,
      applyCoachProposedToHandle,
    ],
  );

  const handleStructuralPatch = useCallback(
    (args: StructuralPatchEffectPayload) => {
      if (itemType !== 'workout' || !canWrite) return;
      const handle = canvasDraftRef.current;
      const gate = resolveStructuralEffectApplyGate({
        alreadyClaimed: isCoachEffectMessageClaimed(
          handledStructuralPatchMessageIdsByTaskRef.current,
          args.taskId,
          args.messageId,
        ),
        hasCanvasHandle: Boolean(handle),
      });
      if (gate === 'already_claimed') return;

      openWorkoutCanvasPaneForCoach();
      if (gate === 'defer') {
        pendingCanvasCoachOpRef.current = {
          kind: 'structural',
          taskId: args.taskId,
          messageId: args.messageId,
          patches: args.patches,
        };
        return;
      }
      const applied = applyCoachStructuralToHandle(handle!, args.patches);
      if (shouldClaimStructuralEffectAfterApply(applied)) {
        pendingCanvasCoachOpRef.current = null;
        claimCoachEffectMessageId(
          handledStructuralPatchMessageIdsByTaskRef.current,
          args.taskId,
          args.messageId,
        );
        return;
      }
      // Keep unclaimed + queued only when dirty refuse can succeed after discard/apply.
      if (handle!.mode === 'edit' && handle!.isDirty) {
        pendingCanvasCoachOpRef.current = {
          kind: 'structural',
          taskId: args.taskId,
          messageId: args.messageId,
          patches: args.patches,
        };
      } else {
        pendingCanvasCoachOpRef.current = null;
      }
    },
    [
      itemType,
      canWrite,
      isCoachEffectMessageClaimed,
      claimCoachEffectMessageId,
      openWorkoutCanvasPaneForCoach,
      applyCoachStructuralToHandle,
    ],
  );

  const { flushNow } = useTaskCoreTextAutosave({
    enabled: canWrite && Boolean(taskId),
    canWrite,
    taskId,
    title,
    description,
    originalRef,
    patchOriginalCoreText,
    currentMetadata: metadata,
    onMetadataDemotedLocally: setMetadata,
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

  /** Cancel Details: discard unsaved non-autosaved state; close without title/desc flush. */
  const handleCancelDetails = useCallback(() => {
    const orig = originalRef.current;
    if (taskId && orig) {
      setTitle(orig.title);
      setDescription(orig.description);
      setStatus(orig.status);
      setPriority(orig.priority);
      setScheduledOn(orig.scheduledOn ?? '');
      setScheduledTime(orig.scheduledTime ?? '');
      let nextItemType = orig.itemType;
      if (nextItemType === 'class' && !canManageClasses) {
        nextItemType = 'task';
      }
      setItemType(nextItemType);
      let parsedMeta: unknown = {};
      try {
        parsedMeta = JSON.parse(orig.metadataJson) as unknown;
      } catch {
        parsedMeta = {};
      }
      const meta = parseTaskMetadata(parsedMeta);
      setMetadata(meta);
      const mf = metadataFieldsFromParsed(meta);
      setEventLocation(mf.eventLocation);
      setEventUrl(mf.eventUrl);
      setEventBring(mf.eventBring);
      setEventGoing(mf.eventGoing);
      setEventCapacity(mf.eventCapacity);
      setEventGoingPeople(mf.eventGoingPeople);
      setExperienceSeason(mf.experienceSeason);
      setExperienceEndDate(mf.experienceEndDate);
      setExperienceHighlights(mf.experienceHighlights);
      setExperienceIncludes(mf.experienceIncludes);
      setExperienceGoodFor(mf.experienceGoodFor);
      setExperienceLocation(mf.experienceLocation);
      setExperienceDurationMin(mf.experienceDurationMin);
      setExperiencePrice(mf.experiencePrice);
      setExperienceGroupMin(mf.experienceGroupMin);
      setExperienceGroupMax(mf.experienceGroupMax);
      setMemoryCaption(mf.memoryCaption);
      setMemoryPeople(mf.memoryPeople);
      setMemoryLinkedEvent(mf.memoryLinkedEvent);
      setMemoryReactions(mf.memoryReactions);
      setWorkoutType(mf.workoutType);
      setWorkoutDurationMin(mf.workoutDurationMin);
      setWorkoutExercises(mf.workoutExercises);
      setProgramGoal(mf.programGoal);
      setProgramDurationWeeks(mf.programDurationWeeks);
      setProgramCurrentWeek(mf.programCurrentWeek);
      setProgramSchedule(mf.programSchedule);
      setProgramSourceTitle(mf.programSourceTitle);
      setCardCoverPath(mf.cardCoverPath);
      setIdeaVotes(mf.ideaVotes);
      setIdeaVotedBy(mf.ideaVotedBy);
      setVisibility(orig.visibility);
      setAssignedTo(orig.assignedTo);
      setLiveStreamEnabled(Boolean(orig.liveStreamEnabled));
    }
    onOpenChange(false);
  }, [taskId, originalRef, canManageClasses, onOpenChange]);

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

  const handleSaveCoreFields = useCallback(
    async (metadataOverride?: Json, options?: SaveCoreFieldsOptions) => {
      const ok = await saveCoreFields(metadataOverride, options);
      if (ok && isOptimisticDraftProp) {
        onOptimisticDraftConsumed?.();
      }
      return ok;
    },
    [saveCoreFields, isOptimisticDraftProp, onOptimisticDraftConsumed],
  );

  const handleToggleIdeaVote = useCallback(async () => {
    const uid = myProfile?.id;
    if (!canWrite || !uid || ideaVoteBusy) return;
    const prevVotes = ideaVotes;
    const prevVotedBy = ideaVotedBy;
    const baseMeta = {
      ...(parseTaskMetadata(metadata) as Record<string, unknown>),
      votes: ideaVotes,
      voted_by: ideaVotedBy,
    };
    const next = toggleIdeaVote(baseMeta, uid);
    const built = buildTaskMetadataPayload(
      'idea',
      { ...formFieldsForProvenance, ideaVotes: next.votes, ideaVotedBy: next.votedBy },
      metadata,
    );
    const demoted = stampUserFields(built, ['votes', 'voted_by']) as typeof built;
    setIdeaVotes(next.votes);
    setIdeaVotedBy(next.votedBy);
    setMetadata(demoted);
    if (!taskId) return;
    setIdeaVoteBusy(true);
    try {
      const ok = await handleSaveCoreFields(demoted, { metadataMerge: 'full' });
      if (!ok) {
        setIdeaVotes(prevVotes);
        setIdeaVotedBy(prevVotedBy);
        setMetadata(metadata);
      }
    } finally {
      setIdeaVoteBusy(false);
    }
  }, [
    canWrite,
    myProfile?.id,
    ideaVoteBusy,
    metadata,
    ideaVotes,
    ideaVotedBy,
    taskId,
    formFieldsForProvenance,
    handleSaveCoreFields,
    setMetadata,
  ]);

  /** Apply canvas edits: persist first, then commit local state — keep edit/dirty if save fails. */
  const handleWorkoutViewerApplyAndSave = useCallback(
    async (payload: WorkoutViewerApplyPayload): Promise<boolean> => {
      if (!canWrite) {
        handleWorkoutViewerApply(payload);
        toast.success('Workout changes applied');
        return true;
      }
      if (!taskId) {
        handleWorkoutViewerApply(payload);
        toast.success('Workout changes applied — save the card to persist');
        return true;
      }

      // Use cuePatchMetadataRef (via hook) — not React metadata — so cue patches ahead of
      // re-render are included in the DB write.
      const nextMeta = computeWorkoutViewerApplyMetadata(payload);
      const ok = await handleSaveCoreFields(nextMeta, {
        metadataMerge: 'workout-cues',
        titleOverride: payload.title,
        descriptionOverride: payload.description,
      });
      if (ok) {
        handleWorkoutViewerApply(payload);
        toast.success('Workout changes saved');
        return true;
      }
      toast.error('Could not save workout changes');
      return false;
    },
    [
      handleWorkoutViewerApply,
      computeWorkoutViewerApplyMetadata,
      canWrite,
      taskId,
      handleSaveCoreFields,
    ],
  );

  const workoutOutlineEditor = useWorkoutOutlineEditor({
    canWrite,
    taskId,
    workspaceId,
    title,
    description,
    metadata,
    setMetadata,
    patchOriginalMetadataJson,
    saveCoreFields,
    enabled: open && itemType === 'workout' && Boolean(taskId),
  });

  const showStructureBuilderCta = Boolean(
    workoutBuilderRouteEnabled &&
    standardRailEnabled &&
    itemType === 'workout' &&
    taskId &&
    canWrite &&
    !workoutOutlineEditor.isOutlineConfirmed &&
    !workoutOutlineEditor.hasFactory,
  );

  const handleOpenStructureBuilder = useCallback(() => {
    if (!taskId) return;
    router.push(
      buildWorkoutBuilderUrl(workspaceId, taskId, {
        return: pathname ?? undefined,
        from: 'modal',
      }),
    );
    onOpenChange(false);
  }, [taskId, workspaceId, pathname, router, onOpenChange]);

  const [outlineRevision, setOutlineRevision] = useState(1);
  const outlineDraftFingerprintRef = useRef<string | null>(null);
  const skipOutlineRevisionBumpRef = useRef(true);

  useEffect(() => {
    if (!open) {
      setContinueSessionPlayerOpen(false);
      setContinueSessionBusy(false);
      setSourceWorkoutLaunch(null);
    }
  }, [open]);

  /** Prefetch source workout so chrome Play and Continue share identical V1 player init. */
  useEffect(() => {
    const sourceId = readWorkoutLogSourceTaskId(metadata);
    if (!open || !isWorkoutLogInProgress({ item_type: itemType, status }) || !sourceId) {
      setSourceWorkoutLaunch(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, metadata, bubble_id')
        .eq('id', sourceId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.id || !data.bubble_id) {
        setSourceWorkoutLaunch(null);
        return;
      }
      setSourceWorkoutLaunch({
        id: data.id,
        title: typeof data.title === 'string' ? data.title : '',
        metadata: (data.metadata ?? {}) as Json,
        bubbleId: data.bubble_id,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, itemType, status, metadata]);

  useEffect(() => {
    if (!open) {
      setOutlineRevision(1);
      outlineDraftFingerprintRef.current = null;
      skipOutlineRevisionBumpRef.current = true;
      return;
    }
    setOutlineRevision(1);
    outlineDraftFingerprintRef.current = null;
    skipOutlineRevisionBumpRef.current = true;
  }, [open, taskId]);

  useEffect(() => {
    if (!open || !taskId || itemType !== 'workout') return;
    const fp = JSON.stringify(workoutOutlineEditor.draftBlocks);
    if (skipOutlineRevisionBumpRef.current) {
      skipOutlineRevisionBumpRef.current = false;
      outlineDraftFingerprintRef.current = fp;
      return;
    }
    if (outlineDraftFingerprintRef.current === fp) return;
    outlineDraftFingerprintRef.current = fp;
    setOutlineRevision((r) => r + 1);
  }, [open, taskId, itemType, workoutOutlineEditor.draftBlocks]);

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
    originalSnapshot,
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
    if (!open) {
      setPreflightCompletedThisOpen(false);
      setPreflightDialogOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setPreflightCompletedThisOpen(false);
    setPreflightDialogOpen(false);
  }, [sessionKey]);

  const activeSessionLaunch = useActiveSessionLaunchFromTaskModal({
    workspaceId,
    taskId,
    itemType,
    canWrite,
    coreDirty,
    saving,
    metadata,
    title,
    createTask,
    saveCoreFields,
  });

  const handlePreflightSubmitAndLaunch = useCallback(async () => {
    // Active Session launch requires an existing factory-backed task; never create-then-launch
    // without a readiness overlay (createTask would drop merged readiness).
    if (!taskId) {
      toast.error('Save the workout card before starting Active Session.');
      return;
    }

    const payload = workoutIntake.buildPreflightPayload();
    const readinessCtx = buildSessionReadinessContext(payload);
    const mergedMetadata = mergeSessionReadinessIntoMetadata(metadataRef.current, readinessCtx);
    setMetadata(mergedMetadata);

    // Overlay only session_readiness_context onto the live form save payload — never `full`
    // (which can wipe stale/incomplete outline from metadataRef).
    const ok = await saveCoreFields(mergedMetadata, { metadataMerge: 'session-readiness' });
    if (!ok) return;

    // Keep ref in sync immediately so any subsequent form save cannot drop readiness.
    metadataRef.current = mergedMetadata;
    setPreflightCompletedThisOpen(true);
    setPreflightDialogOpen(false);
    // Note: Bypassing handleLaunchClick to prevent stale closure overwriting the session-readiness merge.
    router.push(buildActiveSessionUrl(workspaceId, taskId, { from: 'modal' }));
  }, [
    workoutIntake.buildPreflightPayload,
    workoutIntake.readiness,
    workoutIntake.sleepQuality,
    workoutIntake.sorenessArray,
    taskId,
    saveCoreFields,
    router,
    workspaceId,
  ]);

  const handleActiveSessionLaunchClick = useCallback(() => {
    if (hasWorkoutFactory && !preflightCompletedThisOpen) {
      setPreflightDialogOpen(true);
      return;
    }
    activeSessionLaunch.handleLaunchClick();
  }, [hasWorkoutFactory, preflightCompletedThisOpen, activeSessionLaunch.handleLaunchClick]);

  const handleContinueInProgressWorkoutLog = useCallback(() => {
    const sourceId = readWorkoutLogSourceTaskId(metadata);
    if (!sourceId) {
      toast.error('This log is missing a link to its workout session.');
      return;
    }
    if (isActiveSessionRouteEnabled()) {
      setContinueSessionBusy(true);
      router.push(buildActiveSessionUrl(workspaceId, sourceId, { from: 'modal' }));
      onOpenChange(false);
      return;
    }

    void (async () => {
      setContinueSessionBusy(true);
      try {
        if (sourceWorkoutLaunch?.id === sourceId) {
          setContinueSessionPlayerOpen(true);
          return;
        }
        const supabase = createClient();
        const { data, error } = await supabase
          .from('tasks')
          .select('id, title, metadata, bubble_id')
          .eq('id', sourceId)
          .maybeSingle();
        if (error || !data?.id || !data.bubble_id) {
          toast.error('Could not find the source workout for this log.');
          return;
        }
        setSourceWorkoutLaunch({
          id: data.id,
          title: typeof data.title === 'string' ? data.title : '',
          metadata: (data.metadata ?? {}) as Json,
          bubbleId: data.bubble_id,
        });
        setContinueSessionPlayerOpen(true);
      } finally {
        setContinueSessionBusy(false);
      }
    })();
  }, [metadata, workspaceId, router, onOpenChange, sourceWorkoutLaunch]);

  const activeSessionLaunchControlProps = useMemo(() => {
    if (activeSessionLaunch.launchUi.mode === 'hidden') return null;

    return {
      launchUi: activeSessionLaunch.launchUi,
      onLaunchClick: handleActiveSessionLaunchClick,
      busy: activeSessionLaunch.isLaunching,
    };
  }, [
    activeSessionLaunch.launchUi,
    activeSessionLaunch.isLaunching,
    handleActiveSessionLaunchClick,
  ]);

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

  // Edge-trigger only: bump syncKey on false→true (first open). Ask Coach while the
  // pane is already open must not re-bump — otherwise WorkoutViewerContent hard-resets to view.
  // Coach structural/proposed opens set skipNextWorkoutPaneSyncBumpRef so a same-turn apply
  // is not wiped by the hard reset (child effects run before this parent effect).
  useEffect(() => {
    if (showWorkoutSplitPane && !prevWorkoutSplitRef.current) {
      if (skipNextWorkoutPaneSyncBumpRef.current) {
        skipNextWorkoutPaneSyncBumpRef.current = false;
      } else {
        setWorkoutPaneSyncKey((k) => k + 1);
      }
      setMobileUnifiedPane('workout');
    } else if (showWorkoutSplitPane && skipNextWorkoutPaneSyncBumpRef.current) {
      // Pane was already open — clear the Coach skip flag.
      skipNextWorkoutPaneSyncBumpRef.current = false;
    }
    prevWorkoutSplitRef.current = showWorkoutSplitPane;
  }, [showWorkoutSplitPane]);

  // Flush Coach canvas ops queued while the viewer was unmounted or apply was refused (dirty draft).
  useEffect(() => {
    if (!showWorkoutSplitPane) return;
    const pending = pendingCanvasCoachOpRef.current;
    if (!pending) return;
    const handle = canvasDraftRef.current;
    if (!handle) return;
    if (pending.kind === 'structural') {
      // coach_notes write-through works while dirty; other ops may still fail until pristine.
      const applied = applyCoachStructuralToHandle(handle, pending.patches);
      if (!shouldClaimStructuralEffectAfterApply(applied)) return;
      pendingCanvasCoachOpRef.current = null;
      claimCoachEffectMessageId(
        handledStructuralPatchMessageIdsByTaskRef.current,
        pending.taskId,
        pending.messageId,
      );
      return;
    }
    // Full proposed replace still requires a pristine draft.
    if (canvasDraftIsDirty || (handle.mode === 'edit' && handle.isDirty)) return;
    pendingCanvasCoachOpRef.current = null;
    applyCoachProposedToHandle(handle, pending.proposed);
  }, [
    showWorkoutSplitPane,
    workoutPaneSyncKey,
    canvasDraftIsDirty,
    applyCoachStructuralToHandle,
    applyCoachProposedToHandle,
    claimCoachEffectMessageId,
  ]);

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

  const handleAskCoachForCues = useCallback(
    (payload: ExerciseCueRequestV1) => {
      if (itemType !== 'workout' || !canWrite) return;
      setWorkoutSplitEngaged(true);
      setWorkoutViewerOpen(true);
      void (async () => {
        await selectTab('comments');
        setMobileUnifiedPane('card');
        const mention = payload.workout_exercise_index != null ? `#${payload.exercise_name} ` : '';
        const text = `@coach ${mention}Can you help me fill in cues for ${payload.exercise_name}?`;
        const deadline = Date.now() + 2500;
        while (!chatRailRef.current && Date.now() < deadline) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
        }
        if (!chatRailRef.current) {
          toast.error('Coach chat is not ready. Open Comments and try Ask Coach again.');
          return;
        }
        const sent = await chatRailRef.current.sendCoachMessage(text, {
          exercise_cue_request: payload as unknown as Json,
        });
        if (!sent) {
          toast.error('Could not send Ask Coach. Check your connection and try again.');
        }
      })();
    },
    [itemType, canWrite, selectTab, setWorkoutViewerOpen],
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
    const metaPayload = stampUserFields(
      buildTaskMetadataPayload(
        itemType,
        {
          eventLocation,
          eventUrl,
          eventBring,
          eventGoing,
          eventCapacity,
          eventGoingPeople,
          experienceSeason,
          experienceEndDate,
          experienceHighlights,
          experienceIncludes,
          experienceGoodFor,
          experienceLocation,
          experienceDurationMin,
          experiencePrice,
          experienceGroupMin,
          experienceGroupMax,
          memoryCaption,
          memoryPeople,
          memoryLinkedEvent,
          memoryReactions,
          workoutType,
          workoutDurationMin,
          workoutExercises,
          programGoal,
          programDurationWeeks,
          programCurrentWeek,
          programSchedule,
          programSourceTitle,
          cardCoverPath: path,
          ideaVotes,
          ideaVotedBy,
        },
        metadata,
      ),
      ['card_cover_path'],
    ) as ReturnType<typeof buildTaskMetadataPayload>;
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
    const metaPayload = stampUserFields(
      buildTaskMetadataPayload(
        itemType,
        {
          eventLocation,
          eventUrl,
          eventBring,
          eventGoing,
          eventCapacity,
          eventGoingPeople,
          experienceSeason,
          experienceEndDate,
          experienceHighlights,
          experienceIncludes,
          experienceGoodFor,
          experienceLocation,
          experienceDurationMin,
          experiencePrice,
          experienceGroupMin,
          experienceGroupMax,
          memoryCaption,
          memoryPeople,
          memoryLinkedEvent,
          memoryReactions,
          workoutType,
          workoutDurationMin,
          workoutExercises,
          programGoal,
          programDurationWeeks,
          programCurrentWeek,
          programSchedule,
          programSourceTitle,
          cardCoverPath: '',
          ideaVotes,
          ideaVotedBy,
        },
        metadata,
      ),
      ['card_cover_path'],
    ) as ReturnType<typeof buildTaskMetadataPayload>;
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
    (ctx: ExecutionPatchEffectPayload) => {
      if (!taskId) return;
      const dedupeKey = createSessionIdRef.current
        ? `create:${createSessionIdRef.current}`
        : `existing:${ctx.taskId}`;
      const fp = executionPatchFingerprint(ctx.patch);
      let byMessage = handledExecutionPatchFingerprintByTaskRef.current.get(dedupeKey);
      if (!byMessage) {
        byMessage = new Map();
        handledExecutionPatchFingerprintByTaskRef.current.set(dedupeKey, byMessage);
      }
      if (fp != null && byMessage.get(ctx.messageId) === fp) return;
      applyWorkoutPlayerExecutionPatchIfOpen(ctx.patch);
      if (fp != null) byMessage.set(ctx.messageId, fp);
      // Keep the details pane synchronized with agent-side task mutations emitted via
      // message metadata execution patches without forcing a loading-state flash.
      void loadTask(taskId, { silent: true });
    },
    [loadTask, taskId],
  );

  const buildStandardTaskChatRailOutgoingMetadata = useCallback(
    ({ content: _content, files: _files }: { content: string; files: File[] }) => {
      if (itemType !== 'workout' && itemType !== 'workout_log') return null;
      const liveStateBase = {
        v: 1,
        item_type: itemType,
        wizard_step: workoutIntake.step,
        readiness: workoutIntake.readiness,
        sleep_quality: workoutIntake.sleepQuality,
        soreness: workoutIntake.sorenessArray,
      };
      const payload: Record<string, Json> = {
        task_modal_live_state: hasWorkoutFactory
          ? liveStateBase
          : ({
              v: 1,
              item_type: itemType,
              wizard_step: workoutIntake.step,
              ...generationLiveState,
            } as Json),
      };
      const workoutContext = buildTaskModalOutgoingWorkoutContext(metadata, title, { coreDirty });
      if (workoutContext) {
        payload.workoutContext = workoutContext as Json;
      }
      const attachOutlineDraft =
        itemType === 'workout' &&
        taskId &&
        canWrite &&
        !showStructureBuilderCta &&
        !workoutOutlineEditor.isOutlineConfirmed &&
        !workoutOutlineEditor.hasFactory;
      if (attachOutlineDraft) {
        const { blocks, drops } = normalizeOutlineDraft(workoutOutlineEditor.draftBlocks);
        const { status } = readCoachOutlineMetadata(metadata);
        payload.task_modal_outline_draft = buildTaskModalOutlineDraftPayload({
          revision: outlineRevision,
          status,
          confirmed: false,
          blocks,
          drops: drops.length > 0 ? drops : workoutOutlineEditor.validationDrops,
        }) as unknown as Json;
      }
      return payload;
    },
    [
      itemType,
      metadata,
      title,
      taskId,
      canWrite,
      coreDirty,
      showStructureBuilderCta,
      workoutOutlineEditor.draftBlocks,
      workoutOutlineEditor.validationDrops,
      workoutOutlineEditor.isOutlineConfirmed,
      workoutOutlineEditor.hasFactory,
      hasWorkoutFactory,
      outlineRevision,
      generationLiveState,
      workoutIntake.step,
      workoutIntake.readiness,
      workoutIntake.sleepQuality,
      workoutIntake.sorenessArray,
    ],
  );

  const handleOutlineDraftApplied = useCallback(
    (ctx: OutlineDraftAppliedEffectPayload) => {
      if (!taskId || itemType !== 'workout') return;
      const dedupeKey = createSessionIdRef.current
        ? `create:${createSessionIdRef.current}`
        : `existing:${ctx.taskId}`;
      let set = handledOutlineAppliedMessageIdsByTaskRef.current.get(dedupeKey);
      if (!set) {
        set = new Set();
        handledOutlineAppliedMessageIdsByTaskRef.current.set(dedupeKey, set);
      }
      if (set.has(ctx.messageId)) return;
      set.add(ctx.messageId);

      const applied = workoutOutlineEditor.applyCoachPatch({
        revision: ctx.applied.revision,
        localRevision: outlineRevision,
        blocks: ctx.applied.blocks,
        drops: ctx.applied.drops,
        onRevisionSynced: setOutlineRevision,
      });
      if (!applied && !ctx.applied.blocks?.length) {
        void loadTask(taskId, { silent: true });
      }
    },
    [taskId, itemType, outlineRevision, workoutOutlineEditor, loadTask],
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
      titleFieldsOwnedByCover: !showWorkoutSplitPane, // Copilot suggestion ignored: create mode already edits title via TaskModalCoverHeader when chromeShowsCoverTop.
      itemType,
      canWrite,
      onGenerateWorkoutFromIntake: handleGenerateWorkoutFromIntake,
      onSubmitPreflightAndLaunch: handlePreflightSubmitAndLaunch,
      preflightSubmitting: activeSessionLaunch.isLaunching,
      aiWorkoutGenerating,
      workoutIntakePanelProps,
      buildWizardPayload: workoutIntake.buildWizardPayload,
      workoutOutlineEditor: showStructureBuilderCta
        ? null
        : itemType === 'workout' && canWrite && taskId
          ? workoutOutlineEditor
          : null,
      showStructureBuilderCta,
      onOpenStructureBuilder: showStructureBuilderCta ? handleOpenStructureBuilder : undefined,
      onOpenWorkoutViewer: handleOpenWorkoutViewerFromDetails,
      intakeDisabledReason:
        itemType === 'workout' &&
        canWrite &&
        taskId &&
        !hasWorkoutFactory &&
        !workoutOutlineEditor.canRunIntake
          ? 'Confirm workout structure above before completing intake and generating.'
          : undefined,
      taskId,
      cardCoverPath,
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
      eventBring,
      onEventBringChange: setEventBring,
      eventGoing,
      onEventGoingChange: setEventGoing,
      eventCapacity,
      onEventCapacityChange: setEventCapacity,
      eventGoingPeople,
      onEventGoingPeopleChange: setEventGoingPeople,
      experienceSeason,
      onExperienceSeasonChange: setExperienceSeason,
      scheduledOn,
      onExperienceStartDateChange: (v: string) => {
        setScheduledOn(v);
        if (!v) setScheduledTime('');
      },
      experienceEndDate,
      onExperienceEndDateChange: setExperienceEndDate,
      experienceHighlights,
      onExperienceHighlightsChange: setExperienceHighlights,
      experienceIncludes,
      onExperienceIncludesChange: setExperienceIncludes,
      experienceGoodFor,
      onExperienceGoodForChange: setExperienceGoodFor,
      experienceLocation,
      onExperienceLocationChange: setExperienceLocation,
      experienceDurationMin,
      onExperienceDurationMinChange: setExperienceDurationMin,
      experiencePrice,
      onExperiencePriceChange: setExperiencePrice,
      experienceGroupMin,
      onExperienceGroupMinChange: setExperienceGroupMin,
      experienceGroupMax,
      onExperienceGroupMaxChange: setExperienceGroupMax,
      memoryCaption,
      onMemoryCaptionChange: setMemoryCaption,
      memoryPeople,
      onMemoryPeopleChange: setMemoryPeople,
      memoryLinkedEvent,
      onMemoryLinkedEventChange: setMemoryLinkedEvent,
      memoryReactions,
      onMemoryReactionsChange: setMemoryReactions,
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
      archiving,
      loading,
      onArchiveTask: archiveTask,
      onHardDeleteTask: handleModalHardDelete,
      taskMetadata: metadata,
      ideaVotes,
      ideaVotedBy,
      currentUserId: myProfile?.id ?? null,
      ideaVoteBusy,
      onToggleIdeaVote: () => void handleToggleIdeaVote(),
      onPromoteItemType: (next: 'event' | 'program' | 'class') => {
        if (next === 'class' && !canManageClasses) return;
        setItemType(next);
      },
      canPromoteToClass: canManageClasses,
      demotedProvenanceKeys: userDemotedProvenanceKeys,
      onContinueInProgressWorkoutLog: handleContinueInProgressWorkoutLog,
      continueInProgressWorkoutLogBusy: continueSessionBusy,
    }),
    [
      title,
      description,
      showWorkoutSplitPane,
      itemType,
      canWrite,
      canManageClasses,
      handleGenerateWorkoutFromIntake,
      handlePreflightSubmitAndLaunch,
      activeSessionLaunch.isLaunching,
      aiWorkoutGenerating,
      taskId,
      cardCoverPath,
      removeCardCover,
      cardCoverPresetId,
      cardCoverAiHint,
      saving,
      aiCardCoverGenerating,
      generateCardCoverWithAi,
      eventLocation,
      eventUrl,
      eventBring,
      eventGoing,
      eventCapacity,
      eventGoingPeople,
      experienceSeason,
      scheduledOn,
      experienceEndDate,
      experienceHighlights,
      experienceIncludes,
      experienceGoodFor,
      experienceLocation,
      experienceDurationMin,
      experiencePrice,
      experienceGroupMin,
      experienceGroupMax,
      memoryCaption,
      memoryPeople,
      memoryLinkedEvent,
      memoryReactions,
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
      archiving,
      loading,
      archiveTask,
      handleModalHardDelete,
      workoutIntakePanelProps,
      workoutIntake.buildWizardPayload,
      workoutOutlineEditor,
      showStructureBuilderCta,
      handleOpenStructureBuilder,
      handleOpenWorkoutViewerFromDetails,
      hasWorkoutFactory,
      metadata,
      ideaVotes,
      ideaVotedBy,
      myProfile?.id,
      ideaVoteBusy,
      handleToggleIdeaVote,
      userDemotedProvenanceKeys,
      handleContinueInProgressWorkoutLog,
      continueSessionBusy,
    ],
  );

  if (!open) return null;

  const showClassEditorInDetails = itemType === 'class' && canManageClasses;

  const showEditorChrome = !taskId || viewMode === 'full';
  const commentsSplitLayout =
    standardRailEnabled && Boolean(taskId) && tab === 'comments' && isMdUp && !showWorkoutSplitPane;
  /** Hero + inspector tuned for reading workout context next to coach thread / comments-only. */
  const commentsReadingContext =
    Boolean(taskId) &&
    tab === 'comments' &&
    (viewMode === 'comments-only' || commentsInThreadView) &&
    !commentsSplitLayout;
  /** Cover-top row (type chip + More/Close) — not used for comments reading-context chrome. */
  const chromeShowsCoverTop = showEditorChrome && !commentsReadingContext;
  /** Chat-first layout: inner scroll lives in comments panel; outer body does not scroll. */
  const commentsChatLayout = Boolean(taskId) && tab === 'comments';
  /** Hero + messages share one scroll; composer portaled above tab bar (no workout split). */
  const useCommentsUnifiedLayout =
    commentsChatLayout && !showWorkoutSplitPane && !commentsSplitLayout;
  /** CoverHeader owns dismiss only when it is actually mounted (not unified comments). */
  const coverHeaderMounted =
    !showWorkoutSplitPane && !useCommentsUnifiedLayout && chromeShowsCoverTop;
  const heroOnClose = coverHeaderMounted ? undefined : () => handleOpenChange(false);
  const commentsSlimWorkoutViewer =
    Boolean(taskId) && (hasWorkoutViewerContent || aiWorkoutGenerating) && isWorkoutItemType;
  const commentsSlimDetails = Boolean(taskId) && !commentsInThreadView && !hasWorkoutViewerContent;
  const showCommentsSlimActionRow =
    useCommentsUnifiedLayout && (commentsSlimWorkoutViewer || commentsSlimDetails);
  const unifiedThreadBack =
    useCommentsUnifiedLayout && commentsInThreadView && taskId
      ? () => commentsPanelRef.current?.exitThread()
      : undefined;

  const activeChatRailMount: 'unified' | 'split' | 'standard-comments' | null =
    standardRailEnabled && taskId
      ? useCommentsUnifiedLayout
        ? 'unified'
        : commentsSplitLayout
          ? 'split'
          : tab === 'comments'
            ? 'standard-comments'
            : null
      : null;

  /** In-progress log: chrome + Continue V1 player use source workout row (dashboard-shell parity). */
  const workoutPlayerTitle = sourceWorkoutLaunch?.title ?? title;
  const workoutPlayerMetadata = sourceWorkoutLaunch?.metadata ?? metadata;
  const workoutPlayerBubbleId = sourceWorkoutLaunch?.bubbleId ?? bubbleId;
  const workoutPlayerSourceTaskId =
    sourceWorkoutLaunch?.id ?? readWorkoutLogSourceTaskId(metadata) ?? taskId;

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
          'relative z-10 flex min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-3xl)] border border-border bg-card text-card-foreground shadow-2xl transition-[max-width] duration-200 ease-out',
          'max-md:flex-1 max-md:min-h-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-x-0 max-md:border-t-0',
          'md:max-h-[min(90dvh,100dvh)]',
          showWorkoutSplitPane || commentsSplitLayout ? 'max-w-6xl' : 'max-w-[760px]',
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
        {/* Always mounted so CoverHeader / details cover actions can open the picker on any tab. */}
        <input
          ref={cardCoverFileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void uploadCardCover(f);
          }}
        />
        {coverHeaderMounted ? (
          <TaskModalCoverHeader
            itemType={itemType}
            onItemTypeChange={setItemType}
            canManageClasses={canManageClasses}
            canWrite={canWrite}
            visibility={visibility}
            liveStreamEnabled={liveStreamEnabled}
            title={title}
            description={description ?? ''}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            coverPath={cardCoverPath.trim() || null}
            onClose={() => handleOpenChange(false)}
            onArchiveTask={!isCreateMode && taskId ? archiveTask : undefined}
            archiving={archiving}
            onPickCardCover={taskId ? () => cardCoverFileInputRef.current?.click() : undefined}
            showOpenWorkoutViewer={
              Boolean(taskId) &&
              isWorkoutItemType &&
              (hasWorkoutViewerContent || aiWorkoutGenerating)
            }
            onOpenWorkoutViewer={() => setWorkoutViewerOpen(true)}
            heroBadge={workoutLogInProgressHeroBadge}
            onInteraction={() => setHeroCinematicCollapsed(true)}
          />
        ) : taskId && !showWorkoutSplitPane && !useCommentsUnifiedLayout ? (
          isWorkoutItemType ? (
            <TaskModalWorkoutHero
              title={title}
              description={description ?? ''}
              coverPath={cardCoverPath.trim() || null}
              onClose={heroOnClose}
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
              heroBadge={workoutLogInProgressHeroBadge}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              canWrite={canWrite}
            />
          ) : (
            <TaskModalHero
              title={title}
              description={description ?? ''}
              coverPath={cardCoverPath.trim() || null}
              onClose={heroOnClose}
              compactCinematic={
                tab !== 'details' ||
                heroCinematicCollapsed ||
                commentsReadingContext ||
                commentsSplitLayout
              }
              descriptionExpanded={commentsReadingContext}
              descriptionCollapseMode={commentsReadingContext ? 'preview_toggle' : 'none'}
              readingContextActions={null}
              heroBadge={workoutLogInProgressHeroBadge}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              canWrite={canWrite}
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
                        onClose={heroOnClose}
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
                        readingContextActions={
                          commentsReadingContext && itemType === 'workout' && canWrite ? (
                            <WorkoutAiGenerateButton
                              onClick={handleGenerateWorkoutFromComments}
                              busy={aiWorkoutGenerating}
                            />
                          ) : null
                        }
                        heroBadge={workoutLogInProgressHeroBadge}
                        onTitleChange={setTitle}
                        onDescriptionChange={setDescription}
                        canWrite={canWrite}
                      />
                    ) : (
                      <TaskModalHero
                        title={title}
                        description={description ?? ''}
                        coverPath={cardCoverPath.trim() || null}
                        onClose={heroOnClose}
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
                        heroBadge={workoutLogInProgressHeroBadge}
                        onTitleChange={setTitle}
                        onDescriptionChange={setDescription}
                        canWrite={canWrite}
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
                      showTypeAndVisibility={chromeShowsCoverTop}
                      itemType={itemType}
                      canWrite={canWrite}
                      visibility={visibility}
                      onVisibilityChange={setVisibility}
                      liveStreamEnabled={liveStreamEnabled}
                      onLiveStreamEnabledChange={setLiveStreamEnabled}
                      workoutTitle={workoutPlayerTitle}
                      workoutMetadata={workoutPlayerMetadata}
                      bubbleId={workoutPlayerBubbleId}
                      workspaceId={workspaceId}
                      taskId={taskId}
                      workoutPlayerSourceTaskId={workoutPlayerSourceTaskId}
                      activeSessionLaunch={activeSessionLaunchControlProps}
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
                            ref={activeChatRailMount === 'unified' ? chatRailRef : undefined}
                            key={taskId ?? 'create'}
                            workspaceId={workspaceId}
                            taskId={taskId!}
                            bubbleId={bubbleId ?? undefined}
                            canPostMessages={canWrite}
                            defaultAgentSlug={defaultSlugForItemType(itemType)}
                            enableExerciseHashMentions={isWorkoutItemType}
                            enableBlockBlueprintMentions={isWorkoutItemType}
                            workoutExerciseNames={workoutHashExerciseNames}
                            buildOutgoingMessageMetadata={buildStandardTaskChatRailOutgoingMetadata}
                            transcriptFilter={(row) =>
                              row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT
                            }
                            initialCommentThreadMessageId={initialCommentThreadMessageId}
                            onThreadViewChange={setCommentsInThreadView}
                            onExecutionPatch={handleExecutionPatch}
                            onTaskModalIntakePatch={handleTaskModalIntakePatch}
                            onOutlineDraftApplied={handleOutlineDraftApplied}
                            onCardAction={handleCardAction}
                            onWorkoutCuesPatch={handleWorkoutCuesPatch}
                            onProposedWorkoutMetadata={handleProposedWorkoutMetadata}
                            onStructuralPatch={handleStructuralPatch}
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
                  counts={{
                    // Copilot suggestion ignored: already counts incomplete subtasks only.
                    subtasks: subtasks.filter((s) => !s.done).length,
                    activity: activityLog.length,
                  }}
                />
              </>
            ) : (
              <>
                {!(chromeShowsCoverTop && !showWorkoutSplitPane) ? (
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
                ) : null}

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
                                  ref={activeChatRailMount === 'split' ? chatRailRef : undefined}
                                  key={taskId ?? 'create'}
                                  workspaceId={workspaceId}
                                  taskId={taskId!}
                                  bubbleId={bubbleId ?? undefined}
                                  canPostMessages={canWrite}
                                  defaultAgentSlug={defaultSlugForItemType(itemType)}
                                  enableExerciseHashMentions={isWorkoutItemType}
                                  enableBlockBlueprintMentions={isWorkoutItemType}
                                  workoutExerciseNames={workoutHashExerciseNames}
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
                                  onOutlineDraftApplied={handleOutlineDraftApplied}
                                  onCardAction={handleCardAction}
                                  onWorkoutCuesPatch={handleWorkoutCuesPatch}
                                  onProposedWorkoutMetadata={handleProposedWorkoutMetadata}
                                  onStructuralPatch={handleStructuralPatch}
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
                          className="flex min-h-0 min-w-0 flex-1 flex-col"
                          data-testid="task-modal-comments-split-details-pane"
                        >
                          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-4">
                            {loading && taskId ? (
                              <p className="text-sm text-muted-foreground">Loading {typeNoun}…</p>
                            ) : null}
                            {!loading || !taskId ? (
                              <TaskModalDetailsBody {...detailsBodyProps} />
                            ) : null}
                          </div>
                          {canWrite && !showClassEditorInDetails ? (
                            <TaskModalDetailsStickyFooter
                              canWrite={canWrite}
                              isCreateMode={isCreateMode}
                              saving={saving}
                              title={title}
                              typeNoun={typeNoun}
                              coreDirty={coreDirty}
                              onCancel={handleCancelDetails}
                              onCreateTask={createTask}
                              onSaveCoreFields={handleSaveCoreFields}
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="shrink-0">
                        <TaskModalEditorChrome
                          showChrome={showEditorChrome}
                          showTypeAndVisibility={chromeShowsCoverTop}
                          itemType={itemType}
                          canWrite={canWrite}
                          visibility={visibility}
                          onVisibilityChange={setVisibility}
                          liveStreamEnabled={liveStreamEnabled}
                          onLiveStreamEnabledChange={setLiveStreamEnabled}
                          workoutTitle={workoutPlayerTitle}
                          workoutMetadata={workoutPlayerMetadata}
                          bubbleId={workoutPlayerBubbleId}
                          workspaceId={workspaceId}
                          taskId={taskId}
                          workoutPlayerSourceTaskId={workoutPlayerSourceTaskId}
                          activeSessionLaunch={activeSessionLaunchControlProps}
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
                            {tab === 'details' && showClassEditorInDetails ? (
                              <div className="min-w-0 space-y-4">
                                {classEditorInstanceId ? (
                                  <TaskModalClassRsvpCanvas
                                    instanceId={classEditorInstanceId}
                                    workspaceId={workspaceId}
                                    onManageRoster={() => {
                                      void (async () => {
                                        const supabase = createClient();
                                        const { data } = await supabase
                                          .from('class_instances')
                                          .select('capacity')
                                          .eq('id', classEditorInstanceId)
                                          .maybeSingle();
                                        const cap = data?.capacity;
                                        setClassRosterCapacity(
                                          typeof cap === 'number' && Number.isFinite(cap)
                                            ? cap
                                            : null,
                                        );
                                        setClassRosterModalOpen(true);
                                      })();
                                    }}
                                  />
                                ) : null}
                                <ClassEditor
                                  layout="embedded"
                                  workspaceId={workspaceId}
                                  bubbleId={bubbleId}
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
                            ) : tab === 'details' ? (
                              <TaskModalDetailsBody {...detailsBodyProps} />
                            ) : null}

                            {tab === 'comments' &&
                              (taskId ? (
                                <div className="flex min-h-0 flex-1 flex-col">
                                  {standardRailEnabled ? (
                                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                                      <StandardTaskChatRail
                                        ref={
                                          activeChatRailMount === 'standard-comments'
                                            ? chatRailRef
                                            : undefined
                                        }
                                        key={taskId ?? 'create'}
                                        workspaceId={workspaceId}
                                        taskId={taskId}
                                        bubbleId={bubbleId ?? undefined}
                                        canPostMessages={canWrite}
                                        defaultAgentSlug={defaultSlugForItemType(itemType)}
                                        enableExerciseHashMentions={isWorkoutItemType}
                                        enableBlockBlueprintMentions={isWorkoutItemType}
                                        workoutExerciseNames={workoutHashExerciseNames}
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
                                        onOutlineDraftApplied={handleOutlineDraftApplied}
                                        onCardAction={handleCardAction}
                                        onWorkoutCuesPatch={handleWorkoutCuesPatch}
                                        onProposedWorkoutMetadata={handleProposedWorkoutMetadata}
                                        onStructuralPatch={handleStructuralPatch}
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

                {tab === 'details' && canWrite && !showClassEditorInDetails ? (
                  <TaskModalDetailsStickyFooter
                    canWrite={canWrite}
                    isCreateMode={isCreateMode}
                    saving={saving}
                    title={title}
                    typeNoun={typeNoun}
                    coreDirty={coreDirty}
                    onCancel={handleCancelDetails}
                    onCreateTask={createTask}
                    onSaveCoreFields={handleSaveCoreFields}
                  />
                ) : null}

                <TaskModalTabBar
                  tab={tab}
                  onSelectTab={(id) => void selectTab(id)}
                  bubblyProps={modalBubbleUp ?? null}
                  counts={{
                    // Copilot suggestion ignored: already counts incomplete subtasks only.
                    subtasks: subtasks.filter((s) => !s.done).length,
                    activity: activityLog.length,
                  }}
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
                ref={canvasDraftRef}
                workoutSet={viewerWorkoutSet}
                exercises={workoutExercises}
                metadata={metadata}
                title={title}
                description={description}
                canWrite={canWrite}
                workoutUnitSystem={workoutUnitSystem}
                readVariant={itemType === 'workout_log' ? 'log' : 'workout'}
                onApply={handleWorkoutViewerApplyAndSave}
                onApplyCuePatches={handleWorkoutViewerCuePatches}
                onAskCoachForCues={handleAskCoachForCues}
                onDraftDirtyChange={setCanvasDraftIsDirty}
                injuriesOnFile={injuriesOnFile}
                onRequestClose={() => setWorkoutViewerOpen(false)}
                syncKey={workoutPaneSyncKey}
                cardCoverPath={cardCoverPath.trim() || null}
                taskId={taskId}
                activeSessionLaunch={activeSessionLaunchControlProps}
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
                      onSaveTask: (metadataOverride) => {
                        void (taskId
                          ? handleSaveCoreFields(
                              metadataOverride,
                              metadataOverride != null
                                ? { metadataMerge: 'workout-cues' }
                                : undefined,
                            )
                          : createTask());
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
      {hasWorkoutFactory && workoutIntakePanelProps ? (
        <WorkoutPreflightReadinessDialog
          open={preflightDialogOpen}
          onOpenChange={setPreflightDialogOpen}
          {...workoutIntakePanelProps}
          onSubmitPreflight={handlePreflightSubmitAndLaunch}
          isSubmitting={saving}
        />
      ) : null}
      {classEditorInstanceId ? (
        <ManageClassRosterModal
          open={classRosterModalOpen}
          onOpenChange={setClassRosterModalOpen}
          classInstanceId={classEditorInstanceId}
          workspaceId={workspaceId}
          capacity={classRosterCapacity}
          currentUserId={myProfile?.id ?? null}
        />
      ) : null}
      {continueSessionPlayerOpen && sourceWorkoutLaunch ? (
        <WorkoutPlayer
          open
          onClose={() => setContinueSessionPlayerOpen(false)}
          workspaceId={workspaceId}
          workoutTitle={sourceWorkoutLaunch.title}
          metadata={sourceWorkoutLaunch.metadata}
          bubbleId={sourceWorkoutLaunch.bubbleId}
          sourceTaskId={sourceWorkoutLaunch.id}
          sessionId={null}
          class_instance_id={null}
          isMemberView
          canPostMessages
          onComplete={() => {
            setContinueSessionPlayerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
