'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { parseClassRecordingFromInstanceMetadata } from '@/types/live-session-invite';

export type DashboardLiveVideoDockProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  /** Clears this user's live dock (`leaveSession`); does not end the shared workout or the chat invite. */
  onLeaveSession: () => void;
  /** Host: after `endSession` broadcast, marks the chat invite ended (optional). */
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  canWriteTasks?: boolean;
  onWorkoutDeckPersisted?: () => void;
  /** Shown in live_session_participants / AMRAP roster; falls back to `localUserId`. */
  displayName?: string;
};

type DockRouterProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  displayName?: string;
  supabase: SupabaseClient<Database>;
  onLeaveSession: () => void;
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  canWriteTasks: boolean;
  onWorkoutDeckPersisted?: () => void;
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
  displayName: displayNameProp,
}: DockRouterProps) {
  const { isConnected, isConnecting, joinChannel, joinError } = useAgoraSession();
  const isHost = localUserId === session.hostUserId;
  const resolvedDisplayName = displayNameProp?.trim() || localUserId;
  const registeredLiveSessionIdRef = useRef<string | null>(null);
  /** Avoid duplicate class-deck merge RPC attempts for the same live session in one mount. */
  const classDeckMergeAttemptedForSessionRef = useRef<string | null>(null);
  /** One `agora-recording-start` dispatch per live session row after host DB registration (cleared on disconnect cleanup). */
  const recordingCloudStartSentForSessionRef = useRef<string | null>(null);
  /** At most one host toast per live session when `agora-recording-start` fails. */
  const recordingStartFailureToastForSessionRef = useRef<string | null>(null);
  const [liveDbReady, setLiveDbReady] = useState(false);
  /** Host-only: `class_instances.metadata.class_recording.status === 'processing'` for async pipeline UX. */
  const [hostClassRecordingProcessing, setHostClassRecordingProcessing] = useState(false);

  const classInstanceIdForRecording = session.sourceInstanceId?.trim() ?? '';

  useEffect(() => {
    if (!isHost || !classInstanceIdForRecording) {
      setHostClassRecordingProcessing(false);
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
        setHostClassRecordingProcessing(false);
        return;
      }
      const rec = parseClassRecordingFromInstanceMetadata(data?.metadata);
      const processing = rec?.status === 'processing';
      setHostClassRecordingProcessing(processing);
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (processing) {
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

  useLayoutEffect(() => {
    if (!isConnected) {
      registeredLiveSessionIdRef.current = null;
      recordingCloudStartSentForSessionRef.current = null;
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
        const classInstanceForRecording = session.sourceInstanceId?.trim() ?? '';
        if (
          classInstanceForRecording &&
          recordingCloudStartSentForSessionRef.current !== liveSessionRowId
        ) {
          recordingCloudStartSentForSessionRef.current = liveSessionRowId;
          void supabase.functions
            .invoke('agora-recording-start', {
              body: {
                classInstanceId: classInstanceForRecording,
                channelName: session.channelId,
                workspaceId: session.workspaceId,
              },
            })
            .then(({ error: fnError, data }) => {
              const toastKey = liveSessionRowId;
              if (fnError) {
                console.error('[Recording] Failed to start Agora recording.');
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
                console.error('[Recording] Failed to start Agora recording.');
                if (recordingStartFailureToastForSessionRef.current !== toastKey) {
                  recordingStartFailureToastForSessionRef.current = toastKey;
                  toast.error(
                    'Cloud recording could not start. You can upload a recording manually from the class editor later.',
                  );
                }
              }
            })
            .catch(() => {
              console.error('[Recording] Failed to start Agora recording.');
            });
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

      for (let attempt = 0; attempt < 24; attempt++) {
        const { error } = await supabase.rpc('live_session_participant_join', {
          p_session_id: liveSessionRowId,
          p_display_name: resolvedDisplayName,
          p_agora_uid: agoraUid,
          p_role: 'participant',
        });
        if (cancelled) return;
        if (!error) {
          registeredLiveSessionIdRef.current = session.sessionId;
          setLiveDbReady(true);
          return;
        }
        if (process.env.NODE_ENV === 'development' && attempt % 4 === 0) {
          console.warn(
            '[DashboardLiveVideoDockRouter] live_session_participant_join retry',
            attempt,
            error,
          );
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cancelled) {
        console.error(
          '[DashboardLiveVideoDockRouter] live_session_participant_join failed after retries',
        );
      }
    })();

    return () => {
      cancelled = true;
      registeredLiveSessionIdRef.current = null;
      classDeckMergeAttemptedForSessionRef.current = null;
      recordingCloudStartSentForSessionRef.current = null;
      recordingStartFailureToastForSessionRef.current = null;
    };
  }, [
    isConnected,
    isHost,
    localUserId,
    resolvedDisplayName,
    session.sessionId,
    session.sourceInstanceId,
    session.channelId,
    session.workspaceId,
    supabase,
  ]);

  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[DEBUG] DashboardLiveVideoDockRouter Render - Role:',
      isHost ? 'Host' : 'Participant',
      '| Connected:',
      isConnected,
    );
  }

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
        />
      );
    } else {
      routeContent = (
        <ParticipantPreJoinSummary
          sessionId={session.sessionId}
          localUserId={localUserId}
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
        onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
        workspaceId={session.workspaceId}
        supabase={supabase}
        canWriteTasks={canWriteTasks}
        onWorkoutDeckPersisted={onWorkoutDeckPersisted}
        className="min-h-0 flex-1 px-0 py-0"
        liveDbReady={liveDbReady}
        displayName={resolvedDisplayName}
        hostClassRecordingProcessing={hostClassRecordingProcessing}
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
 * Full-width live-video strip above `WorkspaceMainSplit`. Must stay under dashboard `ThemeScope`.
 */
export function DashboardLiveVideoDock({
  session,
  localUserId,
  onLeaveSession,
  onHostEndLiveSessionForAll,
  canWriteTasks = false,
  onWorkoutDeckPersisted,
  displayName,
}: DashboardLiveVideoDockProps) {
  const supabase = useMemo(() => createClient(), []);

  if (session.mode !== 'workout') return null;

  return (
    <div className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/8 to-transparent"
      />
      <div className="relative z-0 flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <AgoraSessionProvider channelId={session.channelId} workspaceId={session.workspaceId}>
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
            />
          </div>
        </AgoraSessionProvider>
      </div>
    </div>
  );
}
