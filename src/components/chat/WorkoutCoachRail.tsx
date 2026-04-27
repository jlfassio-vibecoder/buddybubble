'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeftClose } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { cn } from '@/lib/utils';
import { useMessageThread } from '@/hooks/useMessageThread';
import type { BubbleRow } from '@/types/database';
import { rowToChatMessage } from '@/lib/chat-message-mapper';
import { toChatUserSnapshot, type MessageThreadFilter } from '@/lib/message-thread';
import type { ChatUserSnapshot } from '@/types/chat';
import { useUserProfileStore } from '@/store/userProfileStore';
import { ChatMessageRow } from '@/components/chat/ChatMessageRow';
import { RichMessageComposer } from '@/components/chat/RichMessageComposer';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import { resolveTargetAgent } from '@/lib/agents/resolveTargetAgent';
import { useAgentResponseWait } from '@/hooks/useAgentResponseWait';
import { AgentTypingIndicator } from '@/components/chat/AgentTypingIndicator';
import { logAgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';
import type { Json } from '@/types/database';
import { useWorkspaceSessionSubject } from '@/context/WorkspaceSessionContext';
import { parseExecutionPatchFromMetadata, type ExecutionPatch } from '@/types/execution-patch';

const CHAT_AREA_DEFAULT_AGENT_SLUG = 'coach';
/** Persisted on `messages.metadata` for root inserts; `bubble-agent-dispatch` reads this key. */
const MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY = 'default_agent_slug' as const;
/**
 * Silent trigger for workout-player context. Must match the classifier in
 * `supabase/functions/bubble-agent-dispatch/index.ts` (`isWorkoutContextSentinel`).
 */
const WORKOUT_COACH_SENTINEL_EVENT = '[SYSTEM_EVENT: WORKOUT_CONTEXT]';
/** Server reads this for the opening greeting copy (bubble-agent-dispatch). */
const MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY = 'workout_task_title' as const;

/** True when `workoutData` is non-nullish and not an empty container (fat payload ready). */
function isPopulatedWorkoutDataJson(wd: Json | undefined): boolean {
  if (wd == null) return false;
  if (Array.isArray(wd)) return wd.length > 0;
  if (typeof wd === 'object') return Object.keys(wd as object).length > 0;
  if (typeof wd === 'string') return wd.length > 0;
  return true;
}

/**
 * The silent sentinel + Edge Function need non-empty `workoutContext` JSON. Task cards often
 * surface `workoutExercises` as `[]` until the user builds the workout — that must still wake Coach.
 */
function resolveWorkoutContextForSentinel(
  workoutData: Json | undefined,
  workoutTitle: string,
): Json {
  if (workoutData != null && isPopulatedWorkoutDataJson(workoutData)) {
    return workoutData;
  }
  const title = workoutTitle.trim() || 'this workout';
  return {
    exercises: [],
    workout_task_title: title,
  };
}

export type WorkoutCoachRailProps = {
  workspaceId: string;
  /** Bubble for agent bindings / display name — not used as the message thread filter. */
  bubbleId: string;
  /** Workout task id — `useMessageThread` uses `scope: 'task'` so chat is isolated to this card. */
  taskId: string;
  canPostMessages: boolean;
  sessionId: string | null;
  class_instance_id: string | null;
  isMemberView: boolean;
  /** Task/card title — sent in sentinel metadata for Coach’s on-open greeting. */
  workoutTitle: string;
  workoutData?: Json;
  /** Merges validated `metadata.execution_patch` from the latest Coach message into `WorkoutPlayer` logs. */
  onApplyExecutionPatch: (patch: ExecutionPatch) => void;
  onCollapse?: () => void;
  className?: string;
};

export function WorkoutCoachRail({
  workspaceId,
  bubbleId,
  taskId,
  canPostMessages,
  sessionId,
  class_instance_id,
  isMemberView,
  workoutTitle,
  workoutData,
  onApplyExecutionPatch,
  onCollapse,
  className,
}: WorkoutCoachRailProps) {
  const myProfile = useUserProfileStore((s) => s.profile);
  const { subjectUserId: workspaceSubjectUserId } = useWorkspaceSessionSubject();
  const [bubbleRow, setBubbleRow] = useState<BubbleRow | null>(null);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [activeAgent, setActiveAgent] = useState<'coach' | 'buddy'>('coach');

  // Resolve the bubble row so `useMessageThread` + mappers have names/types.
  useEffect(() => {
    if (!workspaceId || !bubbleId) {
      setBubbleRow(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from('bubbles')
      .select('*')
      .eq('id', bubbleId)
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

  const buddyMention = useMemo(
    () => availableAgents.find((a) => a.slug === 'buddy')?.mention_handle ?? 'Buddy',
    [availableAgents],
  );

  /** Buddy: force @mention for server routing. Coach: raw text; default slug resolves client-side. */
  const applyAgentPrefix = useCallback(
    (raw: string) => {
      if (activeAgent === 'buddy') {
        const trimmed = raw.trimStart();
        return trimmed ? `@${buddyMention.replace(/^@/, '')} ${trimmed}` : raw;
      }
      return raw;
    },
    [activeAgent, buddyMention],
  );

  const agentScopeRootMessages = useMemo(
    () => messages.filter((m) => m.parent_id == null || m.parent_id === ''),
    [messages],
  );

  const waitMain = useAgentResponseWait({
    messages: agentScopeRootMessages,
    myUserId: workspaceSubjectUserId ?? myProfile?.id ?? null,
    agentsByAuthUserId,
    callbacks: {
      onExpire: ({ agentSlug, elapsedMs, configuredFailsafeMs }) => {
        logAgentRoutingEvent({
          event: 'agent.response.timeout',
          agentSlug,
          elapsedMs,
          configuredFailsafeMs,
          bubbleId,
          surface: 'workout-coach-rail',
        });
      },
      onReceived: ({ agentSlug, elapsedMs }) => {
        logAgentRoutingEvent({
          event: 'agent.response.received',
          agentSlug,
          elapsedMs,
          bubbleId,
          surface: 'workout-coach-rail',
        });
      },
    },
  });

  // Latest value for the one-shot sentinel — avoids effect deps on `sendMessage` identity churn.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const isMemberViewRef = useRef(isMemberView);
  isMemberViewRef.current = isMemberView;

  /** At most one sentinel dispatch per rail mount (guards `sendMessage`/message churn and unstable JSON refs). */
  const sentinelHasFiredRef = useRef(false);

  /** Coach message ids for which we applied a patch or confirmed there is nothing to apply (stops effect churn). */
  const coachExecutionHandledMessageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    coachExecutionHandledMessageIdsRef.current.clear();
  }, [taskId]);

  useEffect(() => {
    if (!canPostMessages) return;
    if (!myProfile?.id) return;
    if (!workspaceId || !bubbleId) return;
    if (!taskId?.trim()) return;
    if (!bubbleRow) return;
    if (isLoading) return;
    if (sentinelHasFiredRef.current) return;

    const workoutContext = resolveWorkoutContextForSentinel(workoutData, workoutTitle);

    sentinelHasFiredRef.current = true;

    const metadata: Json = {
      [MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY]: CHAT_AREA_DEFAULT_AGENT_SLUG,
      [MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY]: workoutTitle.trim() || 'this workout',
      sessionId,
      class_instance_id,
      workoutContext,
      is_silent_sentinel: true,
      workout_context: {
        source: 'workout_player',
        sessionId,
        class_instance_id,
        isMemberView: isMemberViewRef.current,
      },
    };

    void sendMessageRef
      .current(WORKOUT_COACH_SENTINEL_EVENT, undefined, undefined, { metadata })
      .catch(() => {
        // Strict once-per-mount: do not retry (avoids tight failure loops / egress spikes).
      });
  }, [
    bubbleId,
    bubbleRow,
    canPostMessages,
    class_instance_id,
    isLoading,
    myProfile?.id,
    sessionId,
    taskId,
    workoutData,
    workoutTitle,
    workspaceId,
  ]);

  // Copilot suggestion ignored: the contract applies `execution_patch` only for the newest message (id + dedupe Set), not a backward scan, to match the edge/player idempotency model.
  useEffect(() => {
    if (isLoading) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last.id) return;
    if (last.content === WORKOUT_COACH_SENTINEL_EVENT) return;
    const coachAuthUserId = availableAgents.find((a) => a.slug === 'coach')?.auth_user_id;
    if (!coachAuthUserId) return;
    if (last.user_id !== coachAuthUserId) return;
    if (coachExecutionHandledMessageIdsRef.current.has(last.id)) return;
    const meta = last.metadata;
    const raw =
      meta != null && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as { execution_patch?: unknown }).execution_patch
        : undefined;
    let patch: ExecutionPatch | null = null;
    try {
      patch = parseExecutionPatchFromMetadata(raw);
    } catch {
      coachExecutionHandledMessageIdsRef.current.add(last.id);
      return;
    }
    if (!patch) {
      coachExecutionHandledMessageIdsRef.current.add(last.id);
      return;
    }
    onApplyExecutionPatch(patch);
    coachExecutionHandledMessageIdsRef.current.add(last.id);
  }, [availableAgents, isLoading, messages, onApplyExecutionPatch]);

  const bubbleName = bubbleRow?.name ?? 'Coach';

  const allMessages = useMemo(() => {
    return messages
      .filter((row) => row.content !== WORKOUT_COACH_SENTINEL_EVENT)
      .map((row) => {
        const base = userById[row.user_id];
        const user: ChatUserSnapshot | undefined =
          myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
        return rowToChatMessage(row, user, bubbleName, replyCounts, agentsByAuthUserId);
      });
  }, [agentsByAuthUserId, bubbleName, messages, myProfile, replyCounts, userById]);

  const handleSubmitIntent = useCallback(() => {
    const draft = applyAgentPrefix(input);
    const result = resolveTargetAgent({
      messageDraft: draft,
      availableAgents,
      contextDefaultAgentSlug: CHAT_AREA_DEFAULT_AGENT_SLUG,
    });
    if (result) {
      logAgentRoutingEvent({
        event: 'agent.routing.resolved',
        agentSlug: result.agent.slug,
        via: result.via,
        bubbleId,
        surface: 'workout-coach-rail',
      });
      waitMain.registerIntent(result.agent);
    } else {
      logAgentRoutingEvent({
        event: 'agent.routing.unresolved',
        surface: 'workout-coach-rail',
        bubbleId,
        hadMention: /(^|[^\w])@\w+/.test(draft),
      });
    }
  }, [applyAgentPrefix, availableAgents, bubbleId, input, waitMain]);

  const handleSubmit = useCallback(
    async ({ text, files }: { text: string; files: File[] }) => {
      if ((!text.trim() && (!files || files.length === 0)) || sending) return false;
      const finalMessageText = applyAgentPrefix(text);
      const routingResult = resolveTargetAgent({
        messageDraft: finalMessageText,
        availableAgents,
        contextDefaultAgentSlug: CHAT_AREA_DEFAULT_AGENT_SLUG,
      });
      const sent = await sendMessage(
        finalMessageText,
        undefined,
        files,
        activeAgent === 'coach'
          ? {
              metadata: {
                [MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY]: CHAT_AREA_DEFAULT_AGENT_SLUG,
              } satisfies Json,
            }
          : undefined,
      );
      if (!sent) return false;
      setInput('');
      setPendingFiles([]);
      if (routingResult) {
        waitMain.registerSuccessfulSend(sent, routingResult.agent);
      }
      return true;
    },
    [activeAgent, applyAgentPrefix, availableAgents, sendMessage, sending, waitMain],
  );

  return (
    <div className={cn('flex h-full min-h-0 min-w-0 flex-col bg-background', className)}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onCollapse?.()}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-primary"
            title="Collapse Coach"
            aria-label="Collapse Coach panel"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Coach</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Ask anything about this workout
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {error ? (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-6">
          {allMessages.map((msg) => (
            <ChatMessageRow
              key={msg.id}
              message={msg}
              density="rail"
              renderContent={(t) => t}
              liveSessionViewerUserId={myProfile?.id ?? null}
            />
          ))}
          {waitMain.pending ? (
            <div className="mt-6 w-full shrink-0">
              <AgentTypingIndicator density="rail" pending={waitMain.pending} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-2">
        <div
          className="grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1"
          role="tablist"
          aria-label="Active agent"
        >
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-2 text-xs font-semibold transition-colors',
              activeAgent === 'coach'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            aria-pressed={activeAgent === 'coach'}
            onClick={() => setActiveAgent('coach')}
            title="Ask Coach about the workout"
          >
            Coach
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-2 text-xs font-semibold transition-colors',
              activeAgent === 'buddy'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            aria-pressed={activeAgent === 'buddy'}
            onClick={() => setActiveAgent('buddy')}
            title="Ask Buddy about using the app"
          >
            Buddy
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {activeAgent === 'coach'
            ? 'Coach (default): workout guidance and form cues.'
            : 'Buddy: help using the player and app.'}
        </p>
      </div>

      <RichMessageComposer
        density="rail"
        formTestId="workout-coach-composer-rail"
        value={input}
        onChange={(next) => setInput(next)}
        onSubmitIntent={handleSubmitIntent}
        onSubmit={handleSubmit}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
        fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
        onAttachmentFilesSelected={() => clearError()}
        disabled={!canPostMessages || sending}
        isSending={sending}
        canSubmit={(!!input.trim() || pendingFiles.length > 0) && canPostMessages && !sending}
        attachDisabled={!canPostMessages || sending}
        createCardDisabled
        placeholder={activeAgent === 'coach' ? 'Message Coach…' : 'Message Buddy…'}
        errorText={null}
        mentionConfig={{
          members: teamMembers.map((m) => ({ id: m.id, name: m.name, email: m.email })),
        }}
        slashConfig={{ tasks: [] }}
        features={{
          enableAtMentions: true,
          enableSlashTaskLinks: false,
          enableCreateAndAttachCard: false,
          enableStartLiveWorkout: false,
        }}
        footerHint={
          <>
            <b>Return</b> to send • <b>Shift + Return</b> for new line • <b>@</b> to mention
          </>
        }
      />
    </div>
  );
}
