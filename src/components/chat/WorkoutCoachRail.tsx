'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UseMessageThreadResult } from '@/hooks/useMessageThread';
import type { BubbleRow } from '@/types/database';
import { rowToChatMessage } from '@/lib/chat-message-mapper';
import { toChatUserSnapshot } from '@/lib/message-thread';
import type { ChatUserSnapshot } from '@/types/chat';
import { useUserProfileStore } from '@/store/userProfileStore';
import { ChatMessageRow } from '@/components/chat/ChatMessageRow';
import {
  RichMessageComposer,
  type RichMessageComposerExercise,
} from '@/components/chat/RichMessageComposer';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import { resolveTargetAgent } from '@/lib/agents/resolveTargetAgent';
import { useAgentResponseWait } from '@/hooks/useAgentResponseWait';
import { AgentTypingIndicator } from '@/components/chat/AgentTypingIndicator';
import { logAgentRoutingEvent } from '@/lib/agents/agentRoutingLogger';
import type { Json } from '@/types/database';
import { useWorkspaceSessionSubject } from '@/context/WorkspaceSessionContext';
import { useExerciseDictionaryAutocomplete } from '@/hooks/useExerciseDictionaryAutocomplete';
import {
  exerciseNamesFromCoachWorkoutData,
  normalizeCoachWorkoutDataProp,
} from '@/lib/workout-factory/build-workout-coach-rail-context';
import type { ExerciseMentionClientPayload } from '@/lib/agents/coach/exercise-mentions';
import {
  buildHashExerciseList,
  exerciseMentionFromHashPick,
  finalizeExerciseMentionsForSend,
} from '@/lib/agents/coach/exercise-mentions-client';
import { scheduleScrollChatThreadToBottom } from '@/lib/chat-thread-auto-scroll';
import { appendSessionTelemetryToCoachMessageMetadata } from '@/lib/agents/coach/coach-telemetry-bridge';
import {
  attachElapsedToSessionTelemetry,
  type SessionTelemetrySnapshot,
} from '@/lib/workout-factory/session-telemetry';
import {
  CHAT_AREA_DEFAULT_AGENT_SLUG,
  MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY,
} from '@/components/chat/workout-coach-rail.constants';

export {
  CHAT_AREA_DEFAULT_AGENT_SLUG,
  MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY,
  MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY,
} from '@/components/chat/workout-coach-rail.constants';

/** User-visible body for the workout open sentinel; routing uses `metadata.is_silent_sentinel` (see Edge Function). */
export const WORKOUT_COACH_SENTINEL_DISPLAY_TEXT = 'Started a workout session.';
/**
 * Pre-metadata rows only: used to keep old test threads from showing the system string in the rail.
 * Do not use for new sends — prefer `isWorkoutPlayerSilentSentinelMessage`.
 */
const WORKOUT_COACH_SENTINEL_LEGACY_CONTENT = '[SYSTEM_EVENT: WORKOUT_CONTEXT]';

type MessageRowForSentinel = { content?: string | null; metadata?: Json | null };

function isWorkoutPlayerSilentSentinelMessage(row: MessageRowForSentinel): boolean {
  const m = row.metadata;
  if (m == null || typeof m !== 'object' || Array.isArray(m)) return false;
  const o = m as Record<string, unknown>;
  if (o.is_silent_sentinel !== true) return false;
  const wctx = o.workout_context;
  if (wctx == null || typeof wctx !== 'object' || Array.isArray(wctx)) return false;
  return (wctx as Record<string, unknown>).source === 'workout_player';
}

/** Hide from rail and skip patch logic: metadata flag (new) or legacy magic string (old DB rows). */
export function shouldHideWorkoutCoachSentinelFromRail(row: MessageRowForSentinel): boolean {
  if (isWorkoutPlayerSilentSentinelMessage(row)) return true;
  if (row.content != null && row.content === WORKOUT_COACH_SENTINEL_LEGACY_CONTENT) return true;
  return false;
}

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
export function resolveWorkoutContextForSentinel(
  workoutData: Json | undefined,
  workoutTitle: string,
): Json {
  const title = workoutTitle.trim() || 'this workout';
  if (workoutData == null || !isPopulatedWorkoutDataJson(workoutData)) {
    return { exercises: [], workout_task_title: title };
  }
  // `WorkoutPlayer` often passes `metadataFieldsFromParsed(...).workoutExercises` — a bare array.
  // Coach `formatExerciseIndexMap` / `parseExerciseNamesFromWorkoutContextJson` expect `{ exercises }`.
  if (Array.isArray(workoutData)) {
    return { exercises: workoutData as Json[], workout_task_title: title };
  }
  if (typeof workoutData === 'object' && workoutData !== null && !Array.isArray(workoutData)) {
    const o = workoutData as Record<string, unknown>;
    if (Array.isArray(o.exercises)) {
      const wt =
        typeof o.workout_task_title === 'string' && o.workout_task_title.trim()
          ? o.workout_task_title.trim()
          : title;
      return { ...o, exercises: o.exercises, workout_task_title: wt } as Json;
    }
    return workoutData;
  }
  return { exercises: [], workout_task_title: title };
}

export type WorkoutCoachRailMessageThread = Pick<
  UseMessageThreadResult,
  | 'messages'
  | 'userById'
  | 'teamMembers'
  | 'agentsByAuthUserId'
  | 'replyCounts'
  | 'isLoading'
  | 'error'
  | 'sending'
  | 'sendMessage'
  | 'clearError'
>;

export type WorkoutCoachRailProps = {
  /** Bubble for agent bindings / display name — not used as the message thread filter. */
  bubbleId: string;
  /** Workout task id — `useMessageThread` uses `scope: 'task'` so chat is isolated to this card. */
  taskId: string;
  canPostMessages: boolean;
  /** Task/card title — used for coach context normalization and hash picker. */
  workoutTitle: string;
  workoutData?: Json;
  bubbleRow: BubbleRow | null;
  messageThread: WorkoutCoachRailMessageThread;
  onCollapse?: () => void;
  className?: string;
  /** Active Session only — performance snapshot (elapsedSec: 0); overlay at send time. */
  sessionTelemetryBase?: SessionTelemetrySnapshot | null;
  /** Active Session only — live elapsed seconds for coach message metadata overlay. */
  elapsedSec?: number;
};

export function WorkoutCoachRail({
  bubbleId,
  taskId,
  canPostMessages,
  workoutTitle,
  workoutData,
  bubbleRow,
  messageThread,
  onCollapse,
  className,
  sessionTelemetryBase,
  elapsedSec = 0,
}: WorkoutCoachRailProps) {
  const myProfile = useUserProfileStore((s) => s.profile);
  const { subjectUserId: workspaceSubjectUserId } = useWorkspaceSessionSubject();
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [activeAgent, setActiveAgent] = useState<'coach' | 'buddy'>('coach');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerShellRef = useRef<HTMLDivElement>(null);

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
  } = messageThread;

  const availableAgents = useMemo(() => [...agentsByAuthUserId.values()], [agentsByAuthUserId]);

  const {
    rows: dictExercises,
    loading: exerciseDictionaryLoading,
    error: exerciseDictionaryError,
  } = useExerciseDictionaryAutocomplete();

  const coachWorkoutContext = useMemo(
    () => normalizeCoachWorkoutDataProp(workoutData, null, workoutTitle),
    [workoutData, workoutTitle],
  );

  const workoutExerciseNameList = useMemo(
    () => exerciseNamesFromCoachWorkoutData(coachWorkoutContext),
    [coachWorkoutContext],
  );

  const hashExercises = useMemo(
    (): RichMessageComposerExercise[] =>
      buildHashExerciseList(workoutExerciseNameList, dictExercises),
    [workoutExerciseNameList, dictExercises],
  );

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

  const waitMain = useAgentResponseWait({
    messages,
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

  /** Pending `#` exercise picks for the next Coach send (`metadata.exercise_mentions`). Cleared after successful send. */
  const exerciseMentionsPendingRef = useRef<ExerciseMentionClientPayload[]>([]);
  useEffect(() => {
    exerciseMentionsPendingRef.current = [];
  }, [taskId]);

  const bubbleName = bubbleRow?.name ?? 'Coach';

  const allMessages = useMemo(() => {
    return messages
      .filter((row) => !shouldHideWorkoutCoachSentinelFromRail(row))
      .map((row) => {
        const base = userById[row.user_id];
        const user: ChatUserSnapshot | undefined =
          myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
        return rowToChatMessage(row, user, bubbleName, replyCounts, agentsByAuthUserId);
      });
  }, [agentsByAuthUserId, bubbleName, messages, myProfile, replyCounts, userById]);

  useEffect(() => {
    return scheduleScrollChatThreadToBottom({
      scrollRoot: scrollContainerRef.current,
      composerShell: composerShellRef.current,
    });
  }, [allMessages, waitMain.pending]);

  const onExerciseHashInserted = useCallback(
    (ex: RichMessageComposerExercise) => {
      const row = exerciseMentionFromHashPick(ex, workoutExerciseNameList);
      exerciseMentionsPendingRef.current = [...exerciseMentionsPendingRef.current, row];
    },
    [workoutExerciseNameList],
  );

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
      const exerciseMentions =
        activeAgent === 'coach'
          ? finalizeExerciseMentionsForSend(
              exerciseMentionsPendingRef.current,
              finalMessageText,
              workoutExerciseNameList,
            )
          : null;

      const coachMetadata = {
        [MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY]: CHAT_AREA_DEFAULT_AGENT_SLUG,
        workoutContext: resolveWorkoutContextForSentinel(
          coachWorkoutContext as unknown as Json,
          workoutTitle,
        ),
        ...(exerciseMentions && exerciseMentions.length > 0
          ? { exercise_mentions: exerciseMentions as unknown as Json }
          : {}),
      } satisfies Json;

      const sent = await sendMessage(
        finalMessageText,
        undefined,
        files,
        activeAgent === 'coach'
          ? {
              metadata:
                sessionTelemetryBase != null
                  ? appendSessionTelemetryToCoachMessageMetadata(
                      coachMetadata as Record<string, unknown>,
                      attachElapsedToSessionTelemetry(sessionTelemetryBase, elapsedSec),
                    )
                  : coachMetadata,
            }
          : undefined,
      );
      if (!sent) return false;
      exerciseMentionsPendingRef.current = [];
      setInput('');
      setPendingFiles([]);
      if (routingResult) {
        waitMain.registerSuccessfulSend(sent, routingResult.agent);
      }
      return true;
    },
    [
      activeAgent,
      applyAgentPrefix,
      availableAgents,
      coachWorkoutContext,
      sendMessage,
      sending,
      waitMain,
      workoutExerciseNameList,
      workoutTitle,
      sessionTelemetryBase,
      elapsedSec,
    ],
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

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
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

      <div ref={composerShellRef} className="shrink-0 border-t border-border bg-card pt-4">
        <RichMessageComposer
          density="rail"
          formTestId="workout-coach-composer-rail"
          className="px-4 pt-0 pb-3"
          value={input}
          onChange={(next) => setInput(next)}
          onSubmitIntent={handleSubmitIntent}
          onExerciseHashInserted={onExerciseHashInserted}
          onSubmit={handleSubmit}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
          onAttachmentFilesSelected={() => clearError()}
          disabled={!canPostMessages}
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
          hashConfig={{
            exercises: hashExercises,
            isLoading: exerciseDictionaryLoading,
            errorText: exerciseDictionaryError,
          }}
          features={{
            enableAtMentions: true,
            enableSlashTaskLinks: false,
            enableExerciseHashMentions: true,
            enableCreateAndAttachCard: false,
            enableStartLiveWorkout: false,
          }}
          footerHint={
            <>
              <b>Return</b> to send • <b>Shift + Return</b> for new line • <b>@</b> to mention •{' '}
              <b>#</b> to tag an exercise
            </>
          }
        />
        <div className="shrink-0 bg-card px-4 pb-4">
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
      </div>
    </div>
  );
}
