'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import { AgoraSessionProvider, LiveSessionView, useAgoraSession } from '@/features/live-video';
import { PreJoinBuilder } from '@/features/live-video/shells/huddle/PreJoinBuilder';
import { ParticipantPreJoinSummary } from '@/features/live-video/shells/ParticipantPreJoinSummary';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import type { Database } from '@/types/database';
import type { LiveVideoActiveSession } from '@/store/liveVideoStore';
import { copyClassDeckToLiveSession } from '@/features/live-video/shells/huddle/live-deck-merge';
import {
  isClassRecordingPipelineBusy,
  parseAsyncSessionFromInstanceMetadata,
  parseClassRecordingFromInstanceMetadata,
} from '@/types/live-session-invite';
import type { SessionAspectRatioId } from '@/features/live-video/state/sessionStateMachine';
import { cn } from '@/lib/utils';

export type DashboardLiveVideoDockProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  /** Clears this user's live dock (`leaveSession`); does not end the shared workout or the chat invite. */
  onLeaveSession: () => void;
  /** Host: after `endSession` broadcast, marks the chat invite ended (optional). */
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  canWriteTasks?: boolean;
  onWorkoutDeckPersisted?: () => void;
  /**
   * Host: fires after a successful `agora-recording-start` invoke. Wire to a board refetch
   * (e.g. `bumpTaskViews`) so the `ClassesBoard` reflects the new pipeline status immediately —
   * a complement to the Realtime subscription on `class_instances`.
   */
  onClassRecordingPipelineUpdated?: () => void;
  /** Shown in live_session_participants / AMRAP roster; falls back to `localUserId`. */
  displayName?: string;
  /** Host deck pick mode: embedded Workouts Kanban (from `dashboard-shell`). */
  boardSelectionPanel?: ReactNode;
  /** Host deck pick mode: mic/camera bar above selection footer. */
  selectionFloatingMediaBar?: ReactNode;
  /** Workouts bubble id for custom exercise injector (`tasks.insert` seed when deck empty). */
  workoutsBubbleId?: string | null;
};

/** Hoist above `LiveTheaterPlanBranch` so Agora survives `shellKind` transitions (e.g. deck selection). */
export type DashboardLiveVideoDockProviderProps = {
  session: LiveVideoActiveSession;
  children: ReactNode;
};

export function DashboardLiveVideoDockProvider({
  session,
  children,
}: DashboardLiveVideoDockProviderProps) {
  if (session.mode !== 'workout') return <>{children}</>;

  return (
    <AgoraSessionProvider
      channelId={session.channelId}
      workspaceId={session.workspaceId}
      sessionId={session.sessionId}
    >
      {children}
    </AgoraSessionProvider>
  );
}

type DockRouterProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  displayName?: string;
  supabase: SupabaseClient<Database>;
  onLeaveSession: () => void;
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  canWriteTasks: boolean;
  onWorkoutDeckPersisted?: () => void;
  onClassRecordingPipelineUpdated?: () => void;
  boardSelectionPanel?: ReactNode;
  selectionFloatingMediaBar?: ReactNode;
  workoutsBubbleId?: string | null;
};

/**
 * Strict pre-join boundary: while Agora is disconnected, the host sees `PreJoinBuilder`
 * (queue + editor + Join CTA); participants see `ParticipantPreJoinSummary` (read-only deck +
 * bulk assign RPC, then Join video). Once `isConnected` or `isConnecting` is true we render
 * the `LiveSessionView` Huddle (video stage + session controls).
 *
 * VideoState (Agora) and SessionState (workout timer) stay independent: this router
 * only reads Agora connectivity, never the session machine.
 */
function DashboardLiveVideoDockRouter({
  session,
  localUserId,
  supabase,
  onLeaveSession,
  onHostEndLiveSessionForAll,
  canWriteTasks,
  onWorkoutDeckPersisted,
  onClassRecordingPipelineUpdated,
  displayName: displayNameProp,
  boardSelectionPanel,
  selectionFloatingMediaBar,
  workoutsBubbleId,
}: DockRouterProps) {
  const { isConnected, isConnecting, joinChannel, joinError } = useAgoraSession();
  const isHost = localUserId === session.hostUserId;
  const resolvedDisplayName = displayNameProp?.trim() || localUserId;
  const registeredLiveSessionIdRef = useRef<string | null>(null);
  /** Avoid duplicate class-deck merge RPC attempts for the same live session in one mount. */
  const classDeckMergeAttemptedForSessionRef = useRef<string | null>(null);
  /** At most one host toast per live session when manual `agora-recording-start` fails. */
  const recordingStartFailureToastForSessionRef = useRef<string | null>(null);
  const [liveDbReady, setLiveDbReady] = useState(false);
  /** Host-only: `class_recording` is in an Agora/manual pipeline state (not yet ready). */
  const [hostClassRecordingPipelineBusy, setHostClassRecordingPipelineBusy] = useState(false);
  /** Host + class card: async workout toggle is on (`metadata.async_session` active). */
  const [isAsyncWorkoutEnabled, setIsAsyncWorkoutEnabled] = useState(false);

  const classInstanceIdForRecording = session.sourceInstanceId?.trim() ?? '';

  /**
   * Host: register `live_sessions` before Agora `joinChannel` requests `/api/live-video/token`.
   * Tier C returns 404 until this row exists; the post-connect effect below used to run only
   * after `isConnected`, which deadlocked token minting for the host.
   */
  useEffect(() => {
    if (!isHost) return;
    const liveSessionRowId = session.sessionId.trim();
    const workspaceId = session.workspaceId.trim();
    if (!liveSessionRowId || !workspaceId) return;

    const agoraUid = String(agoraUidFromUuid(localUserId));
    let cancelled = false;

    void (async () => {
      const { error } = await supabase.rpc('live_session_create', {
        p_session_id: liveSessionRowId,
        p_display_name: resolvedDisplayName,
        p_agora_uid: agoraUid,
        p_workspace_id: workspaceId,
      });
      if (cancelled) return;
      if (error) {
        console.error(
          '[DashboardLiveVideoDockRouter] pre-connect live_session_create',
          error.message,
          error.code,
          error.details,
          error.hint,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isHost, localUserId, resolvedDisplayName, session.sessionId, session.workspaceId, supabase]);

  useEffect(() => {
    if (!isHost || !classInstanceIdForRecording) {
      setHostClassRecordingPipelineBusy(false);
      setIsAsyncWorkoutEnabled(false);
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchRecordingStatus = async () => {
      const { data, error } = await supabase
        .from('class_instances')
        .select('metadata')
        .eq('id', classInstanceIdForRecording)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[DashboardLiveVideoDockRouter] class_recording metadata read',
            error.message,
          );
        }
        setHostClassRecordingPipelineBusy(false);
        setIsAsyncWorkoutEnabled(false);
        return;
      }
      const rec = parseClassRecordingFromInstanceMetadata(data?.metadata);
      const busy = isClassRecordingPipelineBusy(rec?.status);
      setHostClassRecordingPipelineBusy(busy);
      const asyncSession = parseAsyncSessionFromInstanceMetadata(data?.metadata);
      setIsAsyncWorkoutEnabled(Boolean(asyncSession && !asyncSession.endedAt));
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Copilot suggestion ignored: we only poll while the recording pipeline is busy to limit DB load; async hint refreshes on Start Session via a fresh metadata read.
      if (busy) {
        intervalId = setInterval(() => {
          void fetchRecordingStatus();
        }, 15_000);
      }
    };

    void fetchRecordingStatus();

    return () => {
      cancelled = true;
      if (intervalId != null) clearInterval(intervalId);
    };
  }, [isHost, classInstanceIdForRecording, supabase]);

  const handleStartRecording = useCallback(
    async (opts?: { aspectRatio?: SessionAspectRatioId }) => {
      if (!isHost) return;
      const classInstanceForRecording = session.sourceInstanceId?.trim() ?? '';
      if (!classInstanceForRecording) return;
      const liveSessionRowId = session.sessionId.trim();
      if (!liveSessionRowId) return;

      const { data: inst, error: instMetaErr } = await supabase
        .from('class_instances')
        .select('metadata')
        .eq('id', classInstanceForRecording)
        .maybeSingle();

      if (instMetaErr) {
        console.error('[Recording] Unable to verify recording eligibility before start');
        if (recordingStartFailureToastForSessionRef.current !== liveSessionRowId) {
          recordingStartFailureToastForSessionRef.current = liveSessionRowId;
          toast.error('Could not verify recording status. Please try Start Session again.');
        }
        return;
      }

      const asyncSession = parseAsyncSessionFromInstanceMetadata(inst?.metadata);
      setIsAsyncWorkoutEnabled(Boolean(asyncSession && !asyncSession.endedAt));
      if (!asyncSession || asyncSession.endedAt) {
        if (process.env.NODE_ENV === 'development') {
          console.info(
            '[Recording] async workout not enabled — recording suppressed for this session',
          );
        }
        return;
      }

      void supabase.functions
        .invoke('agora-recording-start', {
          body: {
            classInstanceId: classInstanceForRecording,
            channelName: session.channelId,
            workspaceId: session.workspaceId,
            aspectRatio: opts?.aspectRatio ?? '16:9',
          },
        })
        .then(({ error: fnError, data }) => {
          const toastKey = liveSessionRowId;
          if (fnError) {
            console.error('[Recording] Failed to start recording');
            if (recordingStartFailureToastForSessionRef.current !== toastKey) {
              recordingStartFailureToastForSessionRef.current = toastKey;
              toast.error(
                'Cloud recording could not start. You can upload a recording manually from the class editor later.',
              );
            }
            return;
          }
          if (
            data &&
            typeof data === 'object' &&
            'ok' in data &&
            (data as { ok?: boolean }).ok === false
          ) {
            console.error('[Recording] Backend rejected start request');
            if (recordingStartFailureToastForSessionRef.current !== toastKey) {
              recordingStartFailureToastForSessionRef.current = toastKey;
              toast.error(
                'Cloud recording could not start. You can upload a recording manually from the class editor later.',
              );
            }
            return;
          }
          // Realtime on `class_instances` will refetch the board too; this callback is the
          // belt-and-suspenders so cards reflect Phase 1 immediately, even if Realtime is briefly
          // disconnected (mobile sleep, network blip).
          onClassRecordingPipelineUpdated?.();
        })
        .catch(() => {
          console.error('[Recording] Failed to start recording');
        });
    },
    [
      isHost,
      onClassRecordingPipelineUpdated,
      session.sourceInstanceId,
      session.sessionId,
      session.channelId,
      session.workspaceId,
      supabase,
    ],
  );

  useLayoutEffect(() => {
    if (!isConnected) {
      registeredLiveSessionIdRef.current = null;
      recordingStartFailureToastForSessionRef.current = null;
      setLiveDbReady(false);
      return;
    }

    if (registeredLiveSessionIdRef.current === session.sessionId) {
      setLiveDbReady(true);
      return;
    }

    const agoraUid = String(agoraUidFromUuid(localUserId));

    const liveSessionRowId = session.sessionId.trim();
    if (!liveSessionRowId) {
      console.error(
        '[DashboardLiveVideoDockRouter] missing session.sessionId for live_session_create',
      );
      return;
    }

    let cancelled = false;

    void (async () => {
      if (isHost) {
        const { error } = await supabase.rpc('live_session_create', {
          // DB row id is the invite workout session UUID, not the Agora channel string (bb-live-…).
          p_session_id: liveSessionRowId,
          p_display_name: resolvedDisplayName,
          p_agora_uid: agoraUid,
          p_workspace_id: session.workspaceId,
        });
        if (cancelled) return;
        if (error) {
          console.error(
            '[DashboardLiveVideoDockRouter] live_session_create',
            error.message,
            error.code,
            error.details,
            error.hint,
          );
          return;
        }
        // After durable `live_sessions` registration, merge class draft deck (bb-class-deck:…)
        // into this live session id so host/participant deck hooks see rows (RPC is idempotent).
        const sourceInstanceId = session.sourceInstanceId?.trim() ?? '';
        if (sourceInstanceId && classDeckMergeAttemptedForSessionRef.current !== liveSessionRowId) {
          const mergeResult = await copyClassDeckToLiveSession(
            supabase,
            sourceInstanceId,
            liveSessionRowId,
          );
          if (!mergeResult.ok) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Live Merge] copyClassDeckToLiveSession failed:', mergeResult.reason);
            }
          }
          classDeckMergeAttemptedForSessionRef.current = liveSessionRowId;
        }
        if (cancelled) return;
        registeredLiveSessionIdRef.current = session.sessionId;
        setLiveDbReady(true);
        return;
      }

      // Participant: `live_session_participant_join` runs in ParticipantPreJoinSummary before
      // `joinChannel` / Tier C token. If we reached `isConnected`, the row exists — flip readiness.
      registeredLiveSessionIdRef.current = session.sessionId;
      setLiveDbReady(true);
    })();

    return () => {
      cancelled = true;
      registeredLiveSessionIdRef.current = null;
      classDeckMergeAttemptedForSessionRef.current = null;
      recordingStartFailureToastForSessionRef.current = null;
    };
  }, [
    isConnected,
    isHost,
    localUserId,
    resolvedDisplayName,
    session.sessionId,
    session.sourceInstanceId,
    session.workspaceId,
    supabase,
  ]);

  let routeContent: ReactNode;

  if (!isConnected && !isConnecting) {
    if (isHost) {
      routeContent = (
        <PreJoinBuilder
          workspaceId={session.workspaceId}
          supabase={supabase}
          canWriteTasks={canWriteTasks}
          onWorkoutDeckPersisted={onWorkoutDeckPersisted}
          onLeaveDock={onLeaveSession}
          onEndSession={onHostEndLiveSessionForAll}
          className="min-h-0 flex-1 px-0 py-0"
          boardSelectionPanel={boardSelectionPanel}
          workoutsBubbleId={workoutsBubbleId}
        />
      );
    } else {
      routeContent = (
        <ParticipantPreJoinSummary
          sessionId={session.sessionId}
          localUserId={localUserId}
          displayName={resolvedDisplayName}
          supabase={supabase}
          onJoin={joinChannel}
          joinError={joinError}
          onLeaveDock={onLeaveSession}
          className="min-h-0 flex-1 px-0 py-0"
        />
      );
    }
  } else {
    routeContent = (
      <LiveSessionView
        localUserId={localUserId}
        hostUserId={session.hostUserId}
        onAfterLeave={onLeaveSession}
        onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
        workspaceId={session.workspaceId}
        supabase={supabase}
        canWriteTasks={canWriteTasks}
        onWorkoutDeckPersisted={onWorkoutDeckPersisted}
        className="min-h-0 flex-1 px-0 py-0"
        liveDbReady={liveDbReady}
        displayName={resolvedDisplayName}
        hostClassRecordingPipelineBusy={hostClassRecordingPipelineBusy}
        hostAsyncWorkoutEnabled={
          isHost && classInstanceIdForRecording ? isAsyncWorkoutEnabled : undefined
        }
        onHostStartRecording={isHost ? handleStartRecording : undefined}
        boardSelectionPanel={boardSelectionPanel}
        selectionFloatingMediaBar={selectionFloatingMediaBar}
        workoutsBubbleId={workoutsBubbleId}
      />
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm ring-1 ring-black/5"
      data-live-video-dock-router
      data-live-video-role={isHost ? 'host' : 'participant'}
      data-live-video-connected={isConnected ? 'true' : 'false'}
    >
      {routeContent}
    </div>
  );
}

/**
 * Dock chrome + router only. Must render under `DashboardLiveVideoDockProvider` (or legacy
 * `DashboardLiveVideoDock`) so `useAgoraSession` resolves.
 */
export function DashboardLiveVideoDockBody({
  session,
  localUserId,
  onLeaveSession,
  onHostEndLiveSessionForAll,
  canWriteTasks = false,
  onWorkoutDeckPersisted,
  onClassRecordingPipelineUpdated,
  displayName,
  boardSelectionPanel,
  selectionFloatingMediaBar,
  workoutsBubbleId,
}: DashboardLiveVideoDockProps) {
  const supabase = useMemo(() => createClient(), []);
  const { isConnected, isConnecting } = useAgoraSession();
  const compactDockChrome = isConnected || isConnecting;

  if (session.mode !== 'workout') return null;

  return (
    <div
      className={cn(
        'relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        compactDockChrome ? 'px-0 py-0' : 'px-2 py-2',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/8 to-transparent"
      />
      <div className="relative z-0 flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col" data-live-video-dock-frame>
          <DashboardLiveVideoDockRouter
            session={session}
            localUserId={localUserId}
            displayName={displayName}
            supabase={supabase}
            onLeaveSession={onLeaveSession}
            onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
            canWriteTasks={canWriteTasks}
            onWorkoutDeckPersisted={onWorkoutDeckPersisted}
            onClassRecordingPipelineUpdated={onClassRecordingPipelineUpdated}
            boardSelectionPanel={boardSelectionPanel}
            selectionFloatingMediaBar={selectionFloatingMediaBar}
            workoutsBubbleId={workoutsBubbleId}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Full-width live-video strip above `WorkspaceMainSplit`. Must stay under dashboard `ThemeScope`.
 * Prefer `DashboardLiveVideoDockProvider` + `DashboardLiveVideoDockBody` in `dashboard-shell` when
 * the dock subtree may remount across theater shell kinds.
 */
export function DashboardLiveVideoDock(props: DashboardLiveVideoDockProps) {
  if (props.session.mode !== 'workout') return null;

  return (
    <DashboardLiveVideoDockProvider session={props.session}>
      <DashboardLiveVideoDockBody {...props} />
    </DashboardLiveVideoDockProvider>
  );
}
