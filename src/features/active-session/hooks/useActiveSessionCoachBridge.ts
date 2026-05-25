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
  MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY,
  MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY,
  resolveWorkoutContextForSentinel,
  WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
} from '@/components/chat/WorkoutCoachRail';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { useWorkspaceSessionSubject } from '@/context/WorkspaceSessionContext';
import type { CoachSyncAdapter } from '@/features/active-session/actors/coach-sync.actor';
import type { ActiveSessionEvent } from '@/features/active-session/machines/types';
import { useMessageThread } from '@/hooks/useMessageThread';
import { usePermissions } from '@/hooks/use-permissions';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
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
  sessionVm: WorkoutSessionViewModel;
  sentinelFired: boolean;
  sessionStartedAt: string | null;
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
  sessionVm,
  sentinelFired,
  sessionStartedAt,
}: UseActiveSessionCoachBridgeArgs) {
  const profile = useUserProfileStore((s) => s.profile);
  const loadProfile = useUserProfileStore((s) => s.loadProfile);
  const profileId = profile?.id ?? null;
  const { subjectUserId: workspaceSubjectUserId } = useWorkspaceSessionSubject();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const syncActiveFromRoute = useWorkspaceStore((s) => s.syncActiveFromRoute);

  const [coachBubbleRow, setCoachBubbleRow] = useState<BubbleRow | null>(null);

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
      hasCoachAgent: coachAvailableAgents.some((a) => a.slug === 'coach'),
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

    const sentinelMetadata: Json = {
      [MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY]: CHAT_AREA_DEFAULT_AGENT_SLUG,
      [MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY]: workoutTitle.trim() || 'this workout',
      sessionId,
      class_instance_id: classInstanceId,
      workoutContext,
      is_silent_sentinel: true,
      workout_context: {
        source: 'workout_player',
        surface: 'active_session',
        sessionId,
        class_instance_id: classInstanceId,
        isMemberView: true,
      },
    };

    await coachSendMessageRef.current(WORKOUT_COACH_SENTINEL_DISPLAY_TEXT, undefined, undefined, {
      metadata: sentinelMetadata,
    });
  }, [classInstanceId, coachWorkoutContextForSentinel, sessionId, workoutTitle]);

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
      sendCoachSyncEvent(send, { type: 'COACH_RESET' });
    };
  }, [enabled, send, sourceTaskId]);

  useEffect(() => {
    if (!enabled) return;
    const coachAuthUserId =
      coachAvailableAgents.find((a) => a.slug === 'coach')?.auth_user_id ?? null;
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

  useEffect(() => {
    if (!enabled) return;
    sendCoachSyncEvent(send, { type: 'COACH_TRY_SENTINEL' });
  }, [
    enabled,
    send,
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

  return {
    canPostMessages,
    coachBubbleRow,
    coachWorkoutData,
    messageThread,
  };
}
