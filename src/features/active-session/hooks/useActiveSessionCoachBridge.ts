'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { createClient } from '@utils/supabase/client';
import {
  CHAT_AREA_DEFAULT_AGENT_SLUG,
  resolveWorkoutContextForSentinel,
  WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
} from '@/components/chat/WorkoutCoachRail';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { useWorkspaceSessionSubject } from '@/context/WorkspaceSessionContext';
import type {
  CoachSyncAdapter,
  CoachThreadMessageSlice,
} from '@/features/active-session/actors/coach-sync.actor';
import {
  buildActiveSessionTelemetry,
  fireActiveSessionCoachSentinel,
  shouldSkipSentinelForSession,
  threadHasCoachWorkoutOpenReplyForSession,
  threadHasWorkoutOpenSentinelForSession,
} from '@/features/active-session/lib/active-session-coach-telemetry';
import type { ActiveSessionEvent } from '@/features/active-session/machines/types';
import { useMessageThread } from '@/hooks/useMessageThread';
import { usePermissions } from '@/hooks/use-permissions';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
import { readSessionReadinessContext } from '@/lib/workout-factory/session-readiness-context';
import type { SessionReadinessContext } from '@/lib/workout-factory/session-readiness-context';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import { parseMemberRole } from '@/lib/permissions';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { BubbleRow, Json, MessageRowWithEmbeddedTask } from '@/types/database';
import type { WorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';

type CoachBridgeSend = (event: ActiveSessionEvent) => void;

export type CoachSyncAdapterImplRef = MutableRefObject<CoachSyncAdapter>;

export type UseActiveSessionCoachBridgeArgs = {
  enabled: boolean;
  send: CoachBridgeSend;
  coachAdapterImplRef: CoachSyncAdapterImplRef;
  workspaceId: string;
  bubbleId: string;
  sourceTaskId: string;
  sessionId: string;
  classInstanceId: string | null;
  sourceMetadata: Json | null;
  workoutTitle: string;
  draftLogs: SetDraft[][];
  ghostLogs: GhostSetSnapshot[][];
  logTaskId: string | null;
  elapsedSec: number;
  sessionVm: WorkoutSessionViewModel;
  sentinelFired: boolean;
  sentinelFailed?: boolean;
  sessionStartedAt: string | null;
  intervalRowSnapshots: Record<string, IntervalRowSnapshot | null>;
};

function sendCoachSyncEvent(send: CoachBridgeSend, event: ActiveSessionEvent): void {
  send(event);
}

function buildCoachThreadSnapshotFingerprint(params: {
  isLoading: boolean;
  messages: { id?: string | null }[];
  coachAuthUserId: string | null;
  sessionStartedAt: string | null;
}): string {
  const lastId = params.messages.at(-1)?.id ?? '';
  return `${params.isLoading ? 'L' : 'R'}:${params.messages.length}:${lastId}:${params.coachAuthUserId ?? ''}:${params.sessionStartedAt ?? ''}`;
}

function toCoachThreadMessageSlices(
  messages: MessageRowWithEmbeddedTask[],
): CoachThreadMessageSlice[] {
  return messages.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    created_at: m.created_at,
    metadata: m.metadata,
    content: m.content,
  }));
}

export function useActiveSessionCoachBridge({
  enabled,
  send,
  coachAdapterImplRef,
  workspaceId,
  bubbleId,
  sourceTaskId,
  sessionId,
  classInstanceId,
  sourceMetadata,
  workoutTitle,
  draftLogs,
  ghostLogs,
  logTaskId,
  elapsedSec,
  sessionVm,
  sentinelFired,
  sentinelFailed = false,
  sessionStartedAt,
  intervalRowSnapshots,
}: UseActiveSessionCoachBridgeArgs) {
  const profile = useUserProfileStore((s) => s.profile);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const profileId = profile?.id ?? null;
  const { subjectUserId: workspaceSubjectUserId } = useWorkspaceSessionSubject();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const syncActiveFromRoute = useWorkspaceStore((s) => s.syncActiveFromRoute);

  const [coachBubbleRow, setCoachBubbleRow] = useState<BubbleRow | null>(null);
  const lastSentSessionIdRef = useRef<string | null>(null);
  const sendRef = useRef(send);
  const coachResetSessionKeyRef = useRef<string | null>(null);
  const lastSentTryKeyRef = useRef<string | null>(null);
  const lastDispatchedThreadSnapshotFingerprintRef = useRef<string | null>(null);
  const trySentinelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedSecRef = useRef(elapsedSec);
  elapsedSecRef.current = elapsedSec;

  useEffect(() => {
    if (!enabled) return;
    void loadProfile();
  }, [enabled, loadProfile]);

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    void syncActiveFromRoute(workspaceId);
  }, [enabled, syncActiveFromRoute, workspaceId]);

  const workspaceRole = parseMemberRole(
    activeWorkspace?.id === workspaceId ? activeWorkspace.role : 'member',
  );
  const isBubblePrivate = coachBubbleRow?.is_private ?? false;
  const { canPostMessages } = usePermissions(workspaceRole, null, isBubblePrivate);

  useEffect(() => {
    if (!enabled || !workspaceId || !bubbleId) {
      setCoachBubbleRow(null);
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
          setCoachBubbleRow(null);
          return;
        }
        setCoachBubbleRow(data as BubbleRow);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, workspaceId, bubbleId]);

  const coachMessageFilter = useMemo(
    () =>
      enabled && sourceTaskId.trim()
        ? { scope: 'task' as const, taskId: sourceTaskId.trim() }
        : null,
    [enabled, sourceTaskId],
  );

  const coachBubbles = useMemo(() => (coachBubbleRow ? [coachBubbleRow] : []), [coachBubbleRow]);

  const messageThread = useMessageThread({
    filter: coachMessageFilter,
    workspaceId: enabled ? workspaceId : null,
    bubbles: coachBubbles,
    canPostMessages,
    taskBubbleIdHint: bubbleId,
    currentUserId: profileId,
    threadSubjectUserId: workspaceSubjectUserId ?? profileId,
  });

  const messageThreadRef = useRef(messageThread);
  useLayoutEffect(() => {
    sendRef.current = send;
    messageThreadRef.current = messageThread;
  }, [send, messageThread]);

  const liveSetCounts = useMemo(() => {
    if (draftLogs.length === 0 || draftLogs.length !== sessionVm.flatExercises.length) {
      return undefined;
    }
    return draftLogs.map((row) => row.length);
  }, [draftLogs, sessionVm.flatExercises.length]);

  const coachWorkoutData = useMemo(() => {
    const ctx = buildWorkoutCoachRailContext(sourceMetadata, workoutTitle, liveSetCounts, {
      includeFactoryBlob: false,
    });
    const hasExercises = Array.isArray(ctx.exercises) && (ctx.exercises as unknown[]).length > 0;
    const hasRich =
      typeof ctx.workout_structure_summary === 'string' || ctx.ai_workout_factory != null;
    if (!hasExercises && !hasRich) return undefined;
    return ctx as unknown as Json;
  }, [sourceMetadata, workoutTitle, liveSetCounts]);

  const coachWorkoutContextForSentinel = useMemo(
    () => resolveWorkoutContextForSentinel(coachWorkoutData ?? null, workoutTitle),
    [coachWorkoutData, workoutTitle],
  );

  const intervalRowSnapshotsKey = useMemo(
    () => JSON.stringify(intervalRowSnapshots),
    [intervalRowSnapshots],
  );

  const performanceTelemetrySnapshot = useMemo(
    () =>
      buildActiveSessionTelemetry({
        sessionId,
        sourceTaskId,
        logTaskId,
        draftLogs,
        ghostLogs,
        elapsedSec: 0,
        startedAt: sessionStartedAt ?? new Date(0).toISOString(),
        intervalRowSnapshots,
        sessionVm,
      }),
    [
      sessionId,
      sourceTaskId,
      logTaskId,
      draftLogs,
      ghostLogs,
      intervalRowSnapshotsKey,
      sessionVm,
      sessionStartedAt,
    ],
  );

  const sentinelDedupeKey = `${sessionId}:${sourceTaskId}`;

  const coachAvailableAgents = useMemo(
    () => [...messageThread.agentsByAuthUserId.values()],
    [messageThread.agentsByAuthUserId],
  );

  const coachAuthUserId =
    coachAvailableAgents.find((a) => a.slug === CHAT_AREA_DEFAULT_AGENT_SLUG)?.auth_user_id ?? null;

  /** Task metadata first; then refreshed DB row; fall back to newest thread message. */
  const [taskReadinessFetch, setTaskReadinessFetch] = useState<{
    status: 'pending' | 'resolved';
    value: SessionReadinessContext | null;
  }>({ status: 'pending', value: null });

  useEffect(() => {
    if (!enabled || !sourceTaskId.trim()) {
      setTaskReadinessFetch({ status: 'pending', value: null });
      return;
    }

    const fromSource = readSessionReadinessContext(sourceMetadata);
    // SSR/prop already has readiness — resolve immediately; still refresh from DB below.
    if (fromSource) {
      setTaskReadinessFetch({ status: 'resolved', value: fromSource });
    } else {
      setTaskReadinessFetch({ status: 'pending', value: null });
    }

    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from('tasks')
      .select('metadata')
      .eq('id', sourceTaskId.trim())
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Fetch complete: value may be null (user skipped / not on task) — that is an explicit resolve.
        const fromDb = !error && data ? readSessionReadinessContext(data.metadata) : null;
        setTaskReadinessFetch({
          status: 'resolved',
          value: fromDb ?? fromSource,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, sourceTaskId, sourceMetadata]);

  const sessionReadinessContext = useMemo(() => {
    const fromTask = readSessionReadinessContext(sourceMetadata);
    if (fromTask) return fromTask;
    if (taskReadinessFetch.status === 'resolved' && taskReadinessFetch.value) {
      return taskReadinessFetch.value;
    }
    const msgs = messageThread.messages;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const fromMsg = readSessionReadinessContext(msgs[i]?.metadata);
      if (fromMsg) return fromMsg;
    }
    if (taskReadinessFetch.status === 'resolved') return null;
    return null;
  }, [sourceMetadata, taskReadinessFetch, messageThread.messages]);

  /** True once we know readiness is either present or explicitly absent (fetch finished / source had it). */
  const sessionReadinessResolved =
    readSessionReadinessContext(sourceMetadata) != null || taskReadinessFetch.status === 'resolved';

  /** Re-run try-sentinel when thread/coach gates transition from blocked → ready. */
  const sentinelAttemptGateKey = [
    sentinelDedupeKey,
    canPostMessages ? '1' : '0',
    profileId ?? '',
    workspaceId,
    bubbleId,
    coachBubbleRow?.id ?? '',
    messageThread.isLoading ? 'L' : 'R',
    sentinelFired ? 'F' : '0',
    coachAuthUserId ?? '',
    sessionReadinessResolved ? 'RR' : 'RP',
  ].join(':');

  const coachSendMessageRef = useRef(messageThread.sendMessage);
  useLayoutEffect(() => {
    coachSendMessageRef.current = messageThread.sendMessage;
  }, [messageThread.sendMessage]);

  const sentinelGateRef = useRef({
    canPostMessages,
    profileId,
    workspaceId,
    bubbleId,
    sourceTaskId,
    coachBubbleRow,
    isLoading: messageThread.isLoading,
    sentinelFired,
    hasCoachAgent: false,
    sessionReadinessResolved: false,
  });

  useLayoutEffect(() => {
    sentinelGateRef.current = {
      canPostMessages,
      profileId,
      workspaceId,
      bubbleId,
      sourceTaskId,
      coachBubbleRow,
      isLoading: messageThread.isLoading,
      sentinelFired,
      hasCoachAgent: coachAvailableAgents.some((a) => a.slug === CHAT_AREA_DEFAULT_AGENT_SLUG),
      sessionReadinessResolved,
    };
  }, [
    canPostMessages,
    profileId,
    workspaceId,
    bubbleId,
    sourceTaskId,
    coachBubbleRow,
    messageThread.isLoading,
    sentinelFired,
    coachAvailableAgents,
    sessionReadinessResolved,
  ]);

  const fireSentinel = useCallback(async () => {
    const workoutContext = resolveWorkoutContextForSentinel(
      coachWorkoutContextForSentinel as unknown as Json,
      workoutTitle,
    );

    await fireActiveSessionCoachSentinel({
      sendMessage: coachSendMessageRef.current,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle,
      sessionId,
      classInstanceId,
      workoutContext,
      performanceTelemetrySnapshot,
      elapsedSec: elapsedSecRef.current,
      lastSentSessionIdRef,
      sessionReadinessContext,
    });
  }, [
    classInstanceId,
    coachWorkoutContextForSentinel,
    performanceTelemetrySnapshot,
    sessionId,
    sessionReadinessContext,
    workoutTitle,
  ]);

  useLayoutEffect(() => {
    coachAdapterImplRef.current = {
      fireSentinel,
      canAttemptSentinel: () => {
        const gate = sentinelGateRef.current;
        if (!gate.canPostMessages) return false;
        if (!gate.profileId) return false;
        if (!gate.workspaceId || !gate.bubbleId) return false;
        if (!gate.sourceTaskId.trim()) return false;
        if (!gate.coachBubbleRow) return false;
        if (gate.isLoading) return false;
        if (gate.sentinelFired) return false;
        if (!gate.hasCoachAgent) return false;
        // G5: wait until readiness is present or explicitly confirmed null.
        if (!gate.sessionReadinessResolved) return false;
        return true;
      },
    };
  }, [coachAdapterImplRef, fireSentinel]);

  useEffect(() => {
    if (!enabled) return;
    const sessionKey = `${sourceTaskId}:${sessionId}`;
    if (coachResetSessionKeyRef.current === sessionKey) return;
    coachResetSessionKeyRef.current = sessionKey;
    lastSentSessionIdRef.current = null;
    lastSentTryKeyRef.current = null;
    lastDispatchedThreadSnapshotFingerprintRef.current = null;
    sendCoachSyncEvent(sendRef.current, { type: 'COACH_RESET' });
  }, [enabled, sourceTaskId, sessionId]);

  const coachThreadSnapshotFingerprint = useMemo(() => {
    const coachAuthUserId =
      coachAvailableAgents.find((a) => a.slug === CHAT_AREA_DEFAULT_AGENT_SLUG)?.auth_user_id ??
      null;
    return buildCoachThreadSnapshotFingerprint({
      isLoading: messageThread.isLoading,
      messages: messageThread.messages,
      coachAuthUserId,
      sessionStartedAt,
    });
  }, [coachAvailableAgents, messageThread.isLoading, messageThread.messages, sessionStartedAt]);

  useEffect(() => {
    if (!enabled) {
      lastDispatchedThreadSnapshotFingerprintRef.current = null;
      return;
    }
    if (lastDispatchedThreadSnapshotFingerprintRef.current === coachThreadSnapshotFingerprint) {
      return;
    }
    lastDispatchedThreadSnapshotFingerprintRef.current = coachThreadSnapshotFingerprint;

    const thread = messageThreadRef.current;
    const coachAuthUserId =
      [...thread.agentsByAuthUserId.values()].find((a) => a.slug === CHAT_AREA_DEFAULT_AGENT_SLUG)
        ?.auth_user_id ?? null;
    sendCoachSyncEvent(sendRef.current, {
      type: 'COACH_THREAD_SNAPSHOT',
      snapshot: {
        messages: toCoachThreadMessageSlices(thread.messages),
        isLoading: thread.isLoading,
        coachAuthUserId,
        sessionStartedAt,
      },
    });
  }, [enabled, coachThreadSnapshotFingerprint, sessionStartedAt]);

  useEffect(() => {
    if (sentinelFailed) {
      lastSentTryKeyRef.current = null;
    }
  }, [sentinelFailed]);

  useEffect(() => {
    if (!enabled) {
      lastSentTryKeyRef.current = null;
      if (trySentinelDebounceRef.current) {
        clearTimeout(trySentinelDebounceRef.current);
        trySentinelDebounceRef.current = null;
      }
      return;
    }

    if (lastSentTryKeyRef.current === sentinelDedupeKey) {
      return;
    }

    if (trySentinelDebounceRef.current) {
      clearTimeout(trySentinelDebounceRef.current);
    }

    trySentinelDebounceRef.current = setTimeout(() => {
      trySentinelDebounceRef.current = null;
      if (lastSentTryKeyRef.current === sentinelDedupeKey) {
        return;
      }
      if (shouldSkipSentinelForSession(sessionId, lastSentSessionIdRef.current)) {
        return;
      }
      const gate = sentinelGateRef.current;
      if (!gate.canPostMessages) return;
      if (!gate.profileId) return;
      if (!gate.workspaceId || !gate.bubbleId) return;
      if (!gate.sourceTaskId.trim()) return;
      if (!gate.coachBubbleRow) return;
      if (gate.isLoading) return;
      if (gate.sentinelFired) return;
      if (!gate.hasCoachAgent) return;
      // G5: do not try (and do not mark dedupe) until readiness resolve finishes.
      if (!gate.sessionReadinessResolved) return;

      const threadMessages = messageThreadRef.current.messages;
      const coachUserId =
        [...messageThreadRef.current.agentsByAuthUserId.values()].find(
          (a) => a.slug === CHAT_AREA_DEFAULT_AGENT_SLUG,
        )?.auth_user_id ?? null;
      if (threadHasWorkoutOpenSentinelForSession(threadMessages, sessionId)) {
        lastSentSessionIdRef.current = sessionId;
        lastSentTryKeyRef.current = sentinelDedupeKey;
        if (threadHasCoachWorkoutOpenReplyForSession(threadMessages, sessionId, coachUserId)) {
          sendCoachSyncEvent(sendRef.current, { type: 'COACH_SENTINEL_ALREADY_PRESENT' });
        }
        return;
      }
      if (threadHasCoachWorkoutOpenReplyForSession(threadMessages, sessionId, coachUserId)) {
        lastSentSessionIdRef.current = sessionId;
        lastSentTryKeyRef.current = sentinelDedupeKey;
        sendCoachSyncEvent(sendRef.current, { type: 'COACH_SENTINEL_ALREADY_PRESENT' });
        return;
      }

      lastSentTryKeyRef.current = sentinelDedupeKey;
      sendCoachSyncEvent(sendRef.current, { type: 'COACH_TRY_SENTINEL' });
    }, 150);

    return () => {
      if (trySentinelDebounceRef.current) {
        clearTimeout(trySentinelDebounceRef.current);
        trySentinelDebounceRef.current = null;
      }
    };
  }, [enabled, sentinelAttemptGateKey, sentinelDedupeKey, sessionId]);

  return {
    canPostMessages,
    coachBubbleRow,
    coachWorkoutData,
    messageThread,
    performanceTelemetrySnapshot,
    elapsedSec,
    sessionId,
    classInstanceId,
    sessionReadinessContext,
  };
}
