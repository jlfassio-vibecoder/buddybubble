'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ComponentProps,
} from 'react';
import { PanelLeftClose } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { cn } from '@/lib/utils';
import { useMessageThread } from '@/hooks/useMessageThread';
import type { BubbleRow, Json, MessageRowWithEmbeddedTask } from '@/types/database';
import { rowToChatMessage } from '@/lib/chat-message-mapper';
import { toChatUserSnapshot, type MessageThreadFilter } from '@/lib/message-thread';
import type { ChatMessage, ChatUserSnapshot } from '@/types/chat';
import { useUserProfileStore, type UserProfileRow } from '@/store/userProfileStore';
import { ChatMessageRow } from '@/components/chat/ChatMessageRow';
import {
  RichMessageComposer,
  type RichMessageComposerExercise,
  type RichMessageComposerFeatures,
} from '@/components/chat/RichMessageComposer';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import { resolveTargetAgent, type AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import {
  useAgentResponseWait,
  type UseAgentResponseWaitResult,
} from '@/hooks/useAgentResponseWait';
import { AgentTypingIndicator } from '@/components/chat/AgentTypingIndicator';
import { logAgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';
import { useWorkspaceSessionSubject } from '@/context/WorkspaceSessionContext';
import { BUDDY_SLUG } from '@/lib/agents/buddy/config';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import type { ExerciseMentionClientPayload } from '@/lib/agents/coach/exercise-mentions';
import {
  buildHashExerciseList,
  exerciseMentionFromHashPick,
  finalizeExerciseMentionsForSend,
} from '@/lib/agents/coach/exercise-mentions-client';
import type { BlockBlueprintMentionClientPayload } from '@/lib/agents/coach/block-blueprint-mentions';
import {
  BLOCK_PICKER_PRESETS,
  blockBlueprintMentionFromPick,
  finalizeBlockBlueprintMentionsForSend,
  type BlockPickerPreset,
} from '@/lib/agents/coach/block-blueprint-mentions-client';
import { useExerciseDictionaryAutocomplete } from '@/hooks/useExerciseDictionaryAutocomplete';
import { useAgentEffectSweep } from '@/components/chat/agent-effects/useAgentEffectSweep';
import type {
  AgentEffectTelemetryEvent,
  CardActionEffectPayload,
  ExecutionPatchEffectPayload,
  TaskModalIntakePatchEffectPayload,
  OutlineDraftAppliedEffectPayload,
  WorkoutCuesPatchEffectPayload,
} from '@/components/chat/agent-effects/types';
import { useBuddyOnboardingSentinel } from '@/components/modals/task-modal/hooks/useBuddyOnboardingSentinel';
import { useDeepLinkMessageScroll } from '@/components/modals/task-modal/hooks/useDeepLinkMessageScroll';
import { scheduleScrollChatThreadToBottom } from '@/lib/chat-thread-auto-scroll';

const SURFACE = 'standard-task-chat-rail' as const;

/** Stored on `messages.metadata.surface` for agent-dispatch / strategy (snake_case). */
const RAIL_SURFACE_METADATA_VALUE = 'standard_task_chat_rail' as const;

const RAIL_FEATURES_DEFAULT: Required<RichMessageComposerFeatures> = {
  enableAtMentions: true,
  enableSlashTaskLinks: false,
  enableExerciseHashMentions: false,
  enableBlockBlueprintMentions: false,
  enableCreateAndAttachCard: false,
  enableStartLiveWorkout: false,
};

export type StandardTaskChatRailProps = {
  /** Workspace context for member loading + agent binding lookup. */
  workspaceId: string;

  /** `tasks.id`. The rail hardcodes `useMessageThread` to `scope: 'task'`. */
  taskId: string;

  /**
   * Resolved bubble for `taskId`. Optional only because some callers may not
   * have it yet, but providing it avoids an extra `tasks.bubble_id` fetch and
   * lets `bubble_agent_bindings` load before the first send.
   */
  bubbleId?: string;

  /**
   * Required by `useMessageThread`; pass the parent's existing write-permission
   * flag (e.g. TaskModal's `canWrite`).
   */
  canPostMessages: boolean;

  /**
   * Sets `messages.metadata.default_agent_slug` on root inserts. The server
   * resolver (`parseRootDefaultAgentSlug`) reads this value verbatim.
   *
   * `null` / omitted = human-only chat: no agent typing indicator, no failsafe
   * timer, no agent affordances in the composer.
   */
  defaultAgentSlug?: string | null;

  /**
   * Optional overrides for `RichMessageComposer`. Feature flags live under `features`.
   */
  composerOverrides?: Partial<React.ComponentProps<typeof RichMessageComposer>>;

  /**
   * Filter raw DB rows before transcript mapping (e.g. hide Buddy onboarding sentinel).
   * Applied before `rowToChatMessage` so `replyCounts` from the hook stay unchanged.
   */
  transcriptFilter?: (row: MessageRowWithEmbeddedTask) => boolean;

  /** TaskModal-only row callbacks; not promoted to top-level rail props. */
  chatRowExtras?: Pick<
    ComponentProps<typeof ChatMessageRow>,
    | 'onCoachDraftFinalizeSuccess'
    | 'chatCardWorkoutActions'
    | 'bubbleUpPropsFor'
    | 'onOpenAttachment'
  >;

  /** Optional collapse handle (parity with `WorkoutCoachRail`'s header button). */
  onCollapse?: () => void;

  /** When opening from a deep link, scroll this `messages.id` into view once loaded. */
  initialCommentThreadMessageId?: string | null;

  /** Task thread chrome: reset "in thread" UI state once per mount (TaskModal parity). */
  onThreadViewChange?: (inThread: boolean) => void;

  /**
   * Coach `metadata.execution_patch` — parsed and delivered with stable ids/timestamps.
   * Host owns dedupe beyond a single sweep (e.g. TaskModal silent reload).
   */
  onExecutionPatch?: (ctx: ExecutionPatchEffectPayload) => void;

  /**
   * Coach `metadata.task_modal_intake_patch` — parsed and delivered with stable ids/timestamps.
   * Host owns cross-mount dedupe + write policy.
   */
  onTaskModalIntakePatch?: (ctx: TaskModalIntakePatchEffectPayload) => void;

  /**
   * Coach `metadata.card_action` — parsed UI command (e.g. trigger workout generation).
   * Host owns cross-mount dedupe beyond a single sweep.
   */
  onCardAction?: (ctx: CardActionEffectPayload) => void;

  /**
   * Coach `metadata.outline_draft_applied` — builder / outline co-pilot structure sync.
   */
  onOutlineDraftApplied?: (ctx: OutlineDraftAppliedEffectPayload) => void;

  /**
   * Coach `metadata.workout_cues_patch` — workout-scoped cue generation (M3).
   */
  onWorkoutCuesPatch?: (ctx: WorkoutCuesPatchEffectPayload) => void;

  /**
   * Pure telemetry for agent-effect parsing / application. Host may forward to `logAgentRoutingEvent`.
   * The rail does not import the logger for these events (host wires logging).
   */
  onEffectTelemetry?: (event: AgentEffectTelemetryEvent) => void;

  /** `messages.attached_task_id` values for bubble-up props (TaskModal `useTaskBubbleUps` scope). */
  onEmbeddedTaskIdsChange?: (taskIds: string[]) => void;

  /**
   * Polymorphic host hook: extra keys merged into `messages.metadata` on send.
   * Rail-owned keys (`surface`, `default_agent_slug`) win on collision.
   */
  buildOutgoingMessageMetadata?: (args: {
    content: string;
    files: File[];
  }) => Record<string, Json> | null | undefined;

  /** Canonical exercise names on the open canvas; used for `#` picker and index hints. */
  workoutExerciseNames?: string[];

  /** When true, enable `#` picker and `metadata.exercise_mentions` on send (workout / workout_log). */
  enableExerciseHashMentions?: boolean;

  /** When true, enable `:` block blueprint picker and `metadata.block_blueprint_mentions` on send. */
  enableBlockBlueprintMentions?: boolean;

  className?: string;
};

export type StandardTaskChatRailHandle = {
  sendCoachMessage: (text: string, extraMetadata?: Record<string, Json>) => Promise<boolean>;
};

type RailThreadApi = {
  myProfile: UserProfileRow | null;
  messages: MessageRowWithEmbeddedTask[];
  userById: Record<string, ChatUserSnapshot>;
  teamMembers: { id: string; name: string; email: string; avatar?: string }[];
  agentsByAuthUserId: Map<string, AgentDefinitionLite>;
  replyCounts: Map<string, number>;
  isLoading: boolean;
  error: string | null;
  sending: boolean;
  sendMessage: ReturnType<typeof useMessageThread>['sendMessage'];
  clearError: () => void;
  /** All task-scoped rows in order (includes replies: Coach RPC sets `parent_id` to the thread root). */
  transcriptMessages: ChatMessage[];
  mergedFeatures: Required<RichMessageComposerFeatures>;
  restComposerOverrides: Omit<
    Partial<React.ComponentProps<typeof RichMessageComposer>>,
    'features'
  >;
  availableAgents: AgentDefinitionLite[];
  bubbleIdForTelemetry: string | null;
  draft: string;
  setDraft: (v: string) => void;
  pendingFiles: File[];
  setPendingFiles: (v: File[]) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  silentRefreshMessages: () => Promise<void>;
  sendCoachMessage: (
    text: string,
    extraMetadata?: Record<string, Json>,
  ) => Promise<Awaited<ReturnType<ReturnType<typeof useMessageThread>['sendMessage']>> | false>;
};

function useRailThreadApi(props: StandardTaskChatRailProps): RailThreadApi {
  const { workspaceId, taskId, bubbleId, canPostMessages, composerOverrides } = props;

  const myProfile = useUserProfileStore((s) => s.profile);
  const { subjectUserId: workspaceSubjectUserId } = useWorkspaceSessionSubject();
  const [bubbleRow, setBubbleRow] = useState<BubbleRow | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = bubbleId?.trim();
    if (!workspaceId || !id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear bubble when hint removed (matches WorkoutCoachRail)
      setBubbleRow(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from('bubbles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setBubbleRow(null);
          return;
        }
        setBubbleRow(data as BubbleRow);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, bubbleId]);

  const bubbles = useMemo(() => (bubbleRow ? [bubbleRow] : []), [bubbleRow]);

  const filter = useMemo<MessageThreadFilter | null>(() => {
    const id = taskId?.trim();
    if (!id) return null;
    return { scope: 'task', taskId: id };
  }, [taskId]);

  const {
    messages,
    userById,
    teamMembers,
    agentsByAuthUserId,
    replyCounts,
    isLoading,
    error,
    sending,
    sendMessage,
    clearError,
    silentRefreshMessages,
  } = useMessageThread({
    filter,
    workspaceId,
    bubbles,
    canPostMessages,
    taskBubbleIdHint: bubbleId,
    currentUserId: myProfile?.id ?? null,
    threadSubjectUserId: workspaceSubjectUserId ?? myProfile?.id ?? null,
  });

  const availableAgents = useMemo(() => [...agentsByAuthUserId.values()], [agentsByAuthUserId]);

  const taskIdTrimmed = taskId?.trim() ?? '';

  const embeddedTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      if (m.attached_task_id) s.add(m.attached_task_id);
    }
    return [...s];
  }, [messages]);

  const onEmbeddedRef = useRef(props.onEmbeddedTaskIdsChange);
  onEmbeddedRef.current = props.onEmbeddedTaskIdsChange;
  useEffect(() => {
    onEmbeddedRef.current?.(embeddedTaskIds);
  }, [embeddedTaskIds]);

  const buddyAgent = useMemo(
    () => availableAgents.find((a) => a.slug === BUDDY_SLUG) ?? null,
    [availableAgents],
  );

  useBuddyOnboardingSentinel({
    taskId: taskIdTrimmed,
    canWrite: canPostMessages,
    isLoading,
    messagesLength: messages.length,
    buddyAgent,
    sendMessage,
  });

  useDeepLinkMessageScroll({
    taskId: taskIdTrimmed,
    initialCommentThreadMessageId: props.initialCommentThreadMessageId,
    isLoading,
    messages,
  });

  useAgentEffectSweep({
    taskId: taskIdTrimmed,
    isLoading,
    messages,
    agentsByAuthUserId,
    onExecutionPatch: props.onExecutionPatch,
    onTaskModalIntakePatch: props.onTaskModalIntakePatch,
    onCardAction: props.onCardAction,
    onOutlineDraftApplied: props.onOutlineDraftApplied,
    onWorkoutCuesPatch: props.onWorkoutCuesPatch,
    onEffectTelemetry: props.onEffectTelemetry,
  });

  const onThreadViewChangeRef = useRef(props.onThreadViewChange);
  useLayoutEffect(() => {
    onThreadViewChangeRef.current = props.onThreadViewChange;
  }, [props.onThreadViewChange]);
  useEffect(() => {
    onThreadViewChangeRef.current?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount (TaskModal thread chrome parity)
  }, []);

  const bubbleName = bubbleRow?.name ?? 'Bubble';

  const chatMessages = useMemo(() => {
    const filtered = props.transcriptFilter ? messages.filter(props.transcriptFilter) : messages;
    return filtered.map((row) => {
      const base = userById[row.user_id];
      const user: ChatUserSnapshot | undefined =
        myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
      const mapped = rowToChatMessage(row, user, bubbleName, replyCounts, agentsByAuthUserId);
      let out = mapped;
      if (mapped.coachDraft != null) {
        out = { ...out, coachDraft: null };
      }
      // Coach RPCs often attach this task for threading; in-rail that duplicates the
      // right-hand task form and reintroduces human-in-the-loop chrome (ChatFeedTaskCard).
      const isAgentRow = agentsByAuthUserId.has(row.user_id);
      const attachedId =
        typeof row.attached_task_id === 'string' ? row.attached_task_id.trim() : '';
      if (isAgentRow && attachedId && attachedId === taskIdTrimmed) {
        out = { ...out, attachedTask: null, attached_task_id: null };
      }
      return out;
    });
  }, [
    agentsByAuthUserId,
    bubbleName,
    messages,
    myProfile,
    props.transcriptFilter,
    replyCounts,
    taskIdTrimmed,
    userById,
  ]);

  const transcriptMessages = useMemo(() => chatMessages, [chatMessages]);

  const { features: overrideFeatures, ...restComposerOverrides } = composerOverrides ?? {};
  const mergedFeatures: Required<RichMessageComposerFeatures> = {
    ...RAIL_FEATURES_DEFAULT,
    ...overrideFeatures,
    enableExerciseHashMentions:
      (props.enableExerciseHashMentions ?? false) ||
      overrideFeatures?.enableExerciseHashMentions === true,
    enableBlockBlueprintMentions:
      (props.enableBlockBlueprintMentions ?? false) ||
      overrideFeatures?.enableBlockBlueprintMentions === true,
  };

  const bubbleIdForTelemetry: string | null = bubbleId?.trim() || null;

  const sendCoachMessage = useCallback(
    async (text: string, extraMetadata?: Record<string, Json>) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return false;
      const slug = props.defaultAgentSlug?.trim() || COACH_SLUG;
      const hostMeta =
        props.buildOutgoingMessageMetadata?.({ content: trimmed, files: [] }) ?? undefined;
      const hostObj =
        hostMeta != null && typeof hostMeta === 'object' && !Array.isArray(hostMeta)
          ? (hostMeta as Record<string, Json>)
          : {};
      const extraObj = extraMetadata ?? {};
      const mergedMeta: Record<string, Json> = {
        ...hostObj,
        ...extraObj,
        surface: RAIL_SURFACE_METADATA_VALUE,
        default_agent_slug: slug,
      };
      if (mergedFeatures.enableExerciseHashMentions) {
        const rawReq = extraObj.exercise_cue_request;
        if (rawReq && typeof rawReq === 'object' && !Array.isArray(rawReq)) {
          const name = (rawReq as { exercise_name?: unknown }).exercise_name;
          const idx = (rawReq as { workout_exercise_index?: unknown }).workout_exercise_index;
          if (typeof name === 'string' && name.trim()) {
            const token = `#${name.trim()} `;
            mergedMeta.exercise_mentions = [
              {
                token,
                name: name.trim(),
                source: 'workout',
                ...(typeof idx === 'number' && Number.isInteger(idx) && idx >= 0
                  ? { workout_exercise_index: idx }
                  : {}),
              },
            ] as unknown as Json;
          }
        }
      }
      const metadata: Json = mergedMeta as Json;
      const sent = await sendMessage(trimmed, undefined, [], { metadata });
      return sent || false;
    },
    [
      mergedFeatures.enableExerciseHashMentions,
      props.buildOutgoingMessageMetadata,
      props.defaultAgentSlug,
      sendMessage,
      sending,
    ],
  );

  return {
    myProfile,
    messages,
    userById,
    teamMembers,
    agentsByAuthUserId,
    replyCounts,
    isLoading,
    error,
    sending,
    sendMessage,
    clearError,
    transcriptMessages,
    mergedFeatures,
    restComposerOverrides,
    availableAgents,
    bubbleIdForTelemetry,
    draft,
    setDraft,
    pendingFiles,
    setPendingFiles,
    scrollContainerRef,
    silentRefreshMessages,
    sendCoachMessage,
  };
}

function StandardTaskChatRailChrome({
  props,
  api,
  waitMain,
  resolvedDefaultSlug,
}: {
  props: StandardTaskChatRailProps;
  api: RailThreadApi;
  waitMain: UseAgentResponseWaitResult | null;
  resolvedDefaultSlug: string | null;
}) {
  const { onCollapse, className } = props;
  const { chatCardWorkoutActions: _omitChatCardWorkoutActions, ...railChatRowExtras } =
    props.chatRowExtras ?? {};
  const {
    myProfile,
    transcriptMessages,
    mergedFeatures,
    restComposerOverrides,
    availableAgents,
    bubbleIdForTelemetry,
    draft,
    setDraft,
    pendingFiles,
    setPendingFiles,
    scrollContainerRef,
    isLoading,
    error,
    sending,
    sendMessage,
    clearError,
  } = api;

  const contextDefaultAgentSlug = resolvedDefaultSlug;
  const composerShellRef = useRef<HTMLDivElement>(null);
  const exerciseMentionsPendingRef = useRef<ExerciseMentionClientPayload[]>([]);
  const blockBlueprintMentionsPendingRef = useRef<BlockBlueprintMentionClientPayload[]>([]);
  const workoutExerciseNames = props.workoutExerciseNames ?? [];

  const {
    rows: dictExercises,
    loading: exerciseDictionaryLoading,
    error: exerciseDictionaryError,
  } = useExerciseDictionaryAutocomplete();

  const hashExercises = useMemo(
    (): RichMessageComposerExercise[] => buildHashExerciseList(workoutExerciseNames, dictExercises),
    [workoutExerciseNames, dictExercises],
  );

  useEffect(() => {
    exerciseMentionsPendingRef.current = [];
    blockBlueprintMentionsPendingRef.current = [];
  }, [props.taskId]);

  const coachHashMentionsEnabled =
    mergedFeatures.enableExerciseHashMentions && resolvedDefaultSlug === COACH_SLUG;

  const coachBlockBlueprintMentionsEnabled =
    mergedFeatures.enableBlockBlueprintMentions && resolvedDefaultSlug === COACH_SLUG;

  const onExerciseHashInserted = useCallback(
    (ex: RichMessageComposerExercise) => {
      const row = exerciseMentionFromHashPick(ex, workoutExerciseNames);
      exerciseMentionsPendingRef.current = [...exerciseMentionsPendingRef.current, row];
    },
    [workoutExerciseNames],
  );

  const onBlockBlueprintInserted = useCallback((preset: BlockPickerPreset) => {
    const row = blockBlueprintMentionFromPick(preset);
    blockBlueprintMentionsPendingRef.current = [...blockBlueprintMentionsPendingRef.current, row];
  }, []);

  const defaultFooterHint =
    coachHashMentionsEnabled || coachBlockBlueprintMentionsEnabled ? (
      <>
        <b>Return</b> to send • <b>Shift + Return</b> for new line • <b>@</b> to mention
        {coachHashMentionsEnabled ? (
          <>
            {' '}
            • <b>#</b> to tag an exercise
          </>
        ) : null}
        {coachBlockBlueprintMentionsEnabled ? (
          <>
            {' '}
            • <b>:</b> for block format (AMRAP, EMOM…)
          </>
        ) : null}
      </>
    ) : undefined;

  const handleSubmitIntent = useCallback(() => {
    const result = resolveTargetAgent({
      messageDraft: draft,
      availableAgents,
      contextDefaultAgentSlug,
    });
    if (result && waitMain) {
      logAgentRoutingEvent({
        event: 'agent.routing.resolved',
        agentSlug: result.agent.slug,
        via: result.via,
        bubbleId: bubbleIdForTelemetry,
        surface: SURFACE,
      });
      waitMain.registerIntent(result.agent);
    } else if (!result) {
      logAgentRoutingEvent({
        event: 'agent.routing.unresolved',
        surface: SURFACE,
        bubbleId: bubbleIdForTelemetry,
        hadMention: /(^|[^\w])@\w+/.test(draft),
      });
    }
  }, [availableAgents, bubbleIdForTelemetry, contextDefaultAgentSlug, draft, waitMain]);

  const handleSubmit = useCallback(
    async ({ text, files }: { text: string; files: File[] }) => {
      if ((!text.trim() && (!files || files.length === 0)) || sending) return false;
      const routingResult = resolveTargetAgent({
        messageDraft: text,
        availableAgents,
        contextDefaultAgentSlug,
      });
      const slug = resolvedDefaultSlug;
      const hostMeta = props.buildOutgoingMessageMetadata?.({ content: text, files }) ?? undefined;
      const hostObj =
        hostMeta != null && typeof hostMeta === 'object' && !Array.isArray(hostMeta)
          ? (hostMeta as Record<string, Json>)
          : {};
      const railOwnedMeta: Record<string, Json> = {
        surface: RAIL_SURFACE_METADATA_VALUE,
        ...(slug && slug.length > 0 ? { default_agent_slug: slug } : {}),
      };
      const mergedMeta: Record<string, Json> = { ...hostObj, ...railOwnedMeta };
      if (coachHashMentionsEnabled) {
        const exerciseMentions = finalizeExerciseMentionsForSend(
          exerciseMentionsPendingRef.current,
          text,
          workoutExerciseNames,
        );
        if (exerciseMentions && exerciseMentions.length > 0) {
          mergedMeta.exercise_mentions = exerciseMentions as unknown as Json;
        }
      }
      if (coachBlockBlueprintMentionsEnabled) {
        const blockMentions = finalizeBlockBlueprintMentionsForSend(
          blockBlueprintMentionsPendingRef.current,
          text,
        );
        if (blockMentions && blockMentions.length > 0) {
          mergedMeta.block_blueprint_mentions = blockMentions as unknown as Json;
        }
      }
      const metadata: Json | undefined =
        Object.keys(mergedMeta).length > 0 ? (mergedMeta as Json) : undefined;
      const sent = await sendMessage(text, undefined, files, metadata ? { metadata } : undefined);
      if (!sent) return false;
      exerciseMentionsPendingRef.current = [];
      blockBlueprintMentionsPendingRef.current = [];
      setDraft('');
      setPendingFiles([]);
      if (routingResult && waitMain) {
        waitMain.registerSuccessfulSend(sent, routingResult.agent);
      }
      return true;
    },
    [
      availableAgents,
      contextDefaultAgentSlug,
      props.buildOutgoingMessageMetadata,
      coachHashMentionsEnabled,
      coachBlockBlueprintMentionsEnabled,
      resolvedDefaultSlug,
      sendMessage,
      sending,
      setDraft,
      setPendingFiles,
      waitMain,
      workoutExerciseNames,
    ],
  );

  useEffect(() => {
    return scheduleScrollChatThreadToBottom({
      scrollRoot: scrollContainerRef.current,
      composerShell: composerShellRef.current,
    });
  }, [transcriptMessages, waitMain?.pending, scrollContainerRef]);

  return (
    <div className={cn('flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background', className)}>
      {onCollapse ? (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onCollapse()}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-primary"
              title="Collapse"
              aria-label="Collapse chat panel"
            >
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Comments</p>
              <p className="truncate text-[11px] text-muted-foreground">Task thread</p>
            </div>
          </div>
        </header>
      ) : null}

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {error ? (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-6">
          {transcriptMessages.map((msg) => (
            <div key={msg.id} data-message-id={msg.id}>
              <ChatMessageRow
                message={msg}
                density="rail"
                renderContent={(t) => t}
                liveSessionViewerUserId={myProfile?.id ?? null}
                {...railChatRowExtras}
              />
            </div>
          ))}
          {waitMain?.pending ? (
            <div className="mt-6 w-full shrink-0">
              <AgentTypingIndicator density="rail" pending={waitMain.pending} />
            </div>
          ) : null}
        </div>
      </div>

      <div ref={composerShellRef} className="shrink-0 border-t border-border bg-card pt-4">
        <RichMessageComposer
          density="rail"
          formTestId="standard-task-chat-rail-composer"
          className="px-4 pt-0 pb-3"
          value={draft}
          onChange={(next) => setDraft(next)}
          onSubmitIntent={handleSubmitIntent}
          onSubmit={handleSubmit}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
          onAttachmentFilesSelected={() => clearError()}
          disabled={!props.canPostMessages}
          isSending={sending}
          canSubmit={
            (!!draft.trim() || pendingFiles.length > 0) && props.canPostMessages && !sending
          }
          attachDisabled={!props.canPostMessages || sending}
          createCardDisabled
          placeholder="Write a comment…"
          errorText={error}
          mentionConfig={{
            members: api.teamMembers.map((m) => ({ id: m.id, name: m.name, email: m.email })),
          }}
          slashConfig={{ tasks: [] }}
          hashConfig={
            coachHashMentionsEnabled
              ? {
                  exercises: hashExercises,
                  isLoading: exerciseDictionaryLoading,
                  errorText: exerciseDictionaryError,
                }
              : undefined
          }
          onExerciseHashInserted={coachHashMentionsEnabled ? onExerciseHashInserted : undefined}
          blockConfig={
            coachBlockBlueprintMentionsEnabled ? { presets: BLOCK_PICKER_PRESETS } : undefined
          }
          onBlockBlueprintInserted={
            coachBlockBlueprintMentionsEnabled ? onBlockBlueprintInserted : undefined
          }
          features={mergedFeatures}
          footerHint={restComposerOverrides.footerHint ?? defaultFooterHint}
          {...restComposerOverrides}
        />
      </div>
    </div>
  );
}

function StandardTaskChatRailWithAgentWait({
  props,
  api,
  resolvedSlug,
  imperativeRef,
}: {
  props: StandardTaskChatRailProps;
  api: RailThreadApi;
  resolvedSlug: string;
  imperativeRef: React.Ref<StandardTaskChatRailHandle>;
}) {
  const waitMain = useAgentResponseWait({
    messages: api.messages,
    myUserId: api.myProfile?.id ?? null,
    agentsByAuthUserId: api.agentsByAuthUserId,
    callbacks: {
      onExpire: ({ agentSlug, elapsedMs, configuredFailsafeMs }) => {
        logAgentRoutingEvent({
          event: 'agent.response.timeout',
          agentSlug,
          elapsedMs,
          configuredFailsafeMs,
          bubbleId: api.bubbleIdForTelemetry,
          surface: SURFACE,
        });
      },
      onReceived: ({ agentSlug, elapsedMs }) => {
        logAgentRoutingEvent({
          event: 'agent.response.received',
          agentSlug,
          elapsedMs,
          bubbleId: api.bubbleIdForTelemetry,
          surface: SURFACE,
        });
      },
    },
  });

  const sendCoachMessage = useCallback(
    async (text: string, extraMetadata?: Record<string, Json>) => {
      const trimmed = text.trim();
      if (!trimmed || api.sending) return false;
      const routingResult = resolveTargetAgent({
        messageDraft: trimmed,
        availableAgents: api.availableAgents,
        contextDefaultAgentSlug: resolvedSlug,
      });
      if (routingResult) {
        logAgentRoutingEvent({
          event: 'agent.routing.resolved',
          agentSlug: routingResult.agent.slug,
          via: routingResult.via,
          bubbleId: api.bubbleIdForTelemetry,
          surface: SURFACE,
        });
        waitMain.registerIntent(routingResult.agent);
      } else {
        logAgentRoutingEvent({
          event: 'agent.routing.unresolved',
          surface: SURFACE,
          bubbleId: api.bubbleIdForTelemetry,
          hadMention: /(^|[^\w])@\w+/.test(trimmed),
        });
      }
      const sent = await api.sendCoachMessage(trimmed, extraMetadata);
      if (!sent) return false;
      if (routingResult) {
        waitMain.registerSuccessfulSend(sent, routingResult.agent);
      }
      return true;
    },
    [
      api,
      api.availableAgents,
      api.bubbleIdForTelemetry,
      api.sendCoachMessage,
      api.sending,
      resolvedSlug,
      waitMain,
    ],
  );

  useImperativeHandle(imperativeRef, () => ({ sendCoachMessage }), [sendCoachMessage]);

  useEffect(() => {
    if (!waitMain.pending) return;
    const refresh = api.silentRefreshMessages;
    const run = () => {
      void refresh();
    };
    const soon = window.setTimeout(run, 450);
    const interval = window.setInterval(run, 2200);
    return () => {
      window.clearTimeout(soon);
      window.clearInterval(interval);
    };
  }, [waitMain.pending, api.silentRefreshMessages]);

  return (
    <StandardTaskChatRailChrome
      props={props}
      api={api}
      waitMain={waitMain}
      resolvedDefaultSlug={resolvedSlug}
    />
  );
}

function StandardTaskChatRailHumanOnly({
  props,
  api,
  imperativeRef,
}: {
  props: StandardTaskChatRailProps;
  api: RailThreadApi;
  imperativeRef: React.Ref<StandardTaskChatRailHandle>;
}) {
  const sendCoachMessage = useCallback(
    async (text: string, extraMetadata?: Record<string, Json>) => {
      const sent = await api.sendCoachMessage(text, extraMetadata);
      return Boolean(sent);
    },
    [api.sendCoachMessage],
  );

  useImperativeHandle(imperativeRef, () => ({ sendCoachMessage }), [sendCoachMessage]);

  return (
    <StandardTaskChatRailChrome
      props={props}
      api={api}
      waitMain={null}
      resolvedDefaultSlug={null}
    />
  );
}

/**
 * Task-scoped chat rail for polymorphic TaskModal (and future surfaces).
 * Does not mount `useAgentResponseWait` when `defaultAgentSlug` is empty — tests rely on this split.
 */
export const StandardTaskChatRail = forwardRef<
  StandardTaskChatRailHandle,
  StandardTaskChatRailProps
>(function StandardTaskChatRail(props, ref) {
  const resolvedSlug = props.defaultAgentSlug?.trim() ?? '';
  const api = useRailThreadApi(props);

  // Copilot suggestion ignored: human-only mode keeps @ mentions (members + optional @agent); tying `useAgentResponseWait` to ad-hoc agent mentions needs product spec — not blocking default-agent-off UX.
  if (!resolvedSlug) {
    return <StandardTaskChatRailHumanOnly props={props} api={api} imperativeRef={ref} />;
  }
  return (
    <StandardTaskChatRailWithAgentWait
      props={props}
      api={api}
      resolvedSlug={resolvedSlug}
      imperativeRef={ref}
    />
  );
});
