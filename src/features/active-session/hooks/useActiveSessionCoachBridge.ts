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
import type { CoachSyncAdapter } from '@/features/active-session/actors/coach-sync.actor';
import {
  buildActiveSessionTelemetry,
  fireActiveSessionCoachSentinel,
  shouldSkipSentinelForTelemetryFingerprint,
  type ActiveSessionCoachTelemetrySource,
} from '@/features/active-session/lib/active-session-coach-telemetry';
import type { ActiveSessionEvent } from '@/features/active-session/machines/types';
import { useMessageThread } from '@/hooks/useMessageThread';
import { usePermissions } from '@/hooks/use-permissions';
import type { GhostSetSnapshot } from '@/lib/workout-factory/ghost-set-snapshot';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
import type { IntervalRowSnapshot } from '@/lib/workout-factory/interval-timer/types';
import { parseMemberRole } from '@/lib/permissions';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { BubbleRow, Json } from '@/types/database';
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

  const telemetrySource = useMemo((): ActiveSessionCoachTelemetrySource => {
    return {
      sessionId,
      sourceTaskId,
      logTaskId,
      draftLogs,
      ghostLogs,
      elapsedSec,
      startedAt: sessionStartedAt ?? new Date().toISOString(),
      intervalRowSnapshots,
      sessionVm,
    };
  }, [
    sessionId,
    sourceTaskId,
    logTaskId,
    draftLogs,
    ghostLogs,
    elapsedSec,
    sessionStartedAt,
    intervalRowSnapshots,
    sessionVm,
  ]);

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

    await fireActiveSessionCoachSentinel({
      sendMessage: coachSendMessageRef.current,
      displayText: WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
      workoutTitle,
      sessionId,
      classInstanceId,
      workoutContext,
      telemetrySource,
      lastSentFingerprintRef: lastSentTelemetryFingerprintRef,
    });
  }, [classInstanceId, coachWorkoutContextForSentinel, sessionId, telemetrySource, workoutTitle]);

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
    return () => {
      lastSentTelemetryFingerprintRef.current = null;
      sendCoachSyncEvent(send, { type: 'COACH_RESET' });
    };
  }, [enabled, send, sourceTaskId]);

  useEffect(() => {
    if (!enabled) return;
    const coachAuthUserId =
      coachAvailableAgents.find((a) => a.slug === CHAT_AREA_DEFAULT_AGENT_SLUG)?.auth_user_id ??
      null;
    sendCoachSyncEvent(send, {
      type: 'COACH_THREAD_SNAPSHOT',
      snapshot: {
        messages: messageThread.messages,
        isLoading: messageThread.isLoading,
        coachAuthUserId,
        sessionStartedAt,
      },
    });
  }, [
    coachAvailableAgents,
    enabled,
    messageThread.isLoading,
    messageThread.messages,
    send,
    sessionStartedAt,
  ]);

  const performanceTelemetryFingerprint = useMemo(() => {
    return buildActiveSessionTelemetry({
      sessionId,
      sourceTaskId,
      logTaskId,
      draftLogs,
      ghostLogs,
      elapsedSec: 0,
      startedAt: sessionStartedAt ?? new Date(0).toISOString(),
      intervalRowSnapshots,
      sessionVm,
    }).fingerprint;
  }, [
    sessionId,
    sourceTaskId,
    logTaskId,
    draftLogs,
    ghostLogs,
    intervalRowSnapshots,
    sessionVm,
    sessionStartedAt,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (
      shouldSkipSentinelForTelemetryFingerprint(
        performanceTelemetryFingerprint,
        lastSentTelemetryFingerprintRef.current,
      )
    ) {
      return;
    }
    sendCoachSyncEvent(send, { type: 'COACH_TRY_SENTINEL' });
  }, [
    enabled,
    send,
    performanceTelemetryFingerprint,
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

  const sessionTelemetry = useMemo(
    () => buildActiveSessionTelemetry(telemetrySource),
    [telemetrySource],
  );

  return {
    canPostMessages,
    coachBubbleRow,
    coachWorkoutData,
    messageThread,
    sessionTelemetry,
  };
}
