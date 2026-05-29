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
  shouldSkipSentinelForTelemetryFingerprint,
} from '@/features/active-session/lib/active-session-coach-telemetry';
import type { ActiveSessionEvent } from '@/features/active-session/machines/types';
import { useMessageThread } from '@/hooks/useMessageThread';
import { usePermissions } from '@/hooks/use-permissions';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
import { readSessionReadinessContext } from '@/lib/workout-factory/session-readiness-context';
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
  const lastSentTelemetryFingerprintRef = useRef<string | null>(null);
  const sendRef = useRef(send);
  const coachResetSessionKeyRef = useRef<string | null>(null);
  const lastSentFingerprintRef = useRef<string | null>(null);
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
    const ctx = buildWorkoutCoachRailContext(sourceMetadata, workoutTitle, liveSetCounts);
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

  const performanceTelemetryFingerprint = performanceTelemetrySnapshot.fingerprint;

  const coachAvailableAgents = useMemo(
    () => [...messageThread.agentsByAuthUserId.values()],
    [messageThread.agentsByAuthUserId],
  );

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
  ]);

  const fireSentinel = useCallback(async () => {
    const workoutContext = resolveWorkoutContextForSentinel(
      coachWorkoutContextForSentinel as unknown as Json,
      workoutTitle,
    );
    const sessionReadinessContext = readSessionReadinessContext(sourceMetadata);

    await fireActiveSessionCoachSentinel({
      sendMessage: coachSendMessageRef.current,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle,
      sessionId,
      classInstanceId,
      workoutContext,
      performanceTelemetrySnapshot,
      elapsedSec: elapsedSecRef.current,
      lastSentFingerprintRef: lastSentTelemetryFingerprintRef,
      sessionReadinessContext,
    });
  }, [
    classInstanceId,
    coachWorkoutContextForSentinel,
    performanceTelemetrySnapshot,
    sessionId,
    sourceMetadata,
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
        return true;
      },
    };
  }, [coachAdapterImplRef, fireSentinel]);

  useEffect(() => {
    if (!enabled) return;
    const sessionKey = sourceTaskId;
    if (coachResetSessionKeyRef.current === sessionKey) return;
    coachResetSessionKeyRef.current = sessionKey;
    lastSentTelemetryFingerprintRef.current = null;
    lastSentFingerprintRef.current = null;
    lastDispatchedThreadSnapshotFingerprintRef.current = null;
    sendCoachSyncEvent(sendRef.current, { type: 'COACH_RESET' });
  }, [enabled, sourceTaskId]);

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
    if (!enabled) {
      lastSentFingerprintRef.current = null;
      if (trySentinelDebounceRef.current) {
        clearTimeout(trySentinelDebounceRef.current);
        trySentinelDebounceRef.current = null;
      }
      return;
    }

    if (lastSentFingerprintRef.current === performanceTelemetryFingerprint) {
      return;
    }

    if (trySentinelDebounceRef.current) {
      clearTimeout(trySentinelDebounceRef.current);
    }

    trySentinelDebounceRef.current = setTimeout(() => {
      trySentinelDebounceRef.current = null;
      if (lastSentFingerprintRef.current === performanceTelemetryFingerprint) {
        return;
      }
      if (
        shouldSkipSentinelForTelemetryFingerprint(
          performanceTelemetryFingerprint,
          lastSentTelemetryFingerprintRef.current,
        )
      ) {
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
      lastSentFingerprintRef.current = performanceTelemetryFingerprint;
      sendCoachSyncEvent(sendRef.current, { type: 'COACH_TRY_SENTINEL' });
    }, 150);

    return () => {
      if (trySentinelDebounceRef.current) {
        clearTimeout(trySentinelDebounceRef.current);
        trySentinelDebounceRef.current = null;
      }
    };
  }, [enabled, performanceTelemetryFingerprint]);

  return {
    canPostMessages,
    coachBubbleRow,
    coachWorkoutData,
    messageThread,
    performanceTelemetrySnapshot,
    elapsedSec,
  };
}
