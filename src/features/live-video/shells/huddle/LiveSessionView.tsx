'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Layout } from 'react-resizable-panels';
import { useGroupRef } from 'react-resizable-panels';
import {
  HostNavActionsProvider,
  useHostNavActions,
} from '@/features/live-video/contexts/HostNavActionsContext';
import { AmrapRailProvider } from '@/features/live-video/contexts/AmrapRailContext';
import {
  WrapperAttachProvider,
  useWrapperAttach,
} from '@/features/live-video/contexts/WrapperAttachContext';
import {
  SessionDrawerProvider,
  useSessionDrawer,
} from '@/features/live-video/contexts/SessionDrawerContext';
import { TimerBackgroundProvider } from '@/features/live-video/contexts/TimerBackgroundContext';
import {
  VideoOverlaySlotsProvider,
  useVideoOverlaySlots,
} from '@/features/live-video/contexts/VideoOverlaySlotsContext';
import { useAgoraSession } from '@/features/live-video/agora-session-context';
import { useExcludeUidForTiles } from '@/features/live-video/hooks/useExcludeUidForTiles';
import { useLiveSessionRoster } from '@/features/live-video/hooks/useLiveSessionRoster';
import { useSessionTeardown } from '@/features/live-video/hooks/useSessionTeardown';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import { LiveSessionTopBar } from '@/features/live-video/shells/huddle/LiveSessionTopBar';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import { SessionClockMini } from '@/features/live-video/shells/huddle/SessionClockMini';
import { SessionControlsActions } from '@/features/live-video/shells/huddle/SessionControlsActions';
import { WorkoutQueueRegion } from '@/features/live-video/ui/WorkoutQueueRegion';
import { Tier3ExercisesReopenPill } from '@/features/live-video/ui/Tier3ExercisesReopenPill';
import { useTier3DrawerOpen } from '@/features/live-video/hooks/useTier3DrawerOpen';
import { Button } from '@/components/ui/button';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { LiveDeckExerciseInjector } from '@/features/live-video/shells/huddle/LiveDeckExerciseInjector';
import { ParticipantWorkoutLogger } from '@/features/live-video/shells/ParticipantWorkoutLogger';
import { ActivePhaseOverlays } from '@/features/live-video/shells/huddle/ActivePhaseOverlays';
import { PostSessionSummary } from '@/features/live-video/shells/PostSessionSummary';
import { RosterDrawer } from '@/features/live-video/shells/RosterDrawer';
import { RosterDrawerTrigger } from '@/features/live-video/shells/RosterDrawerTrigger';
import { VideoStageWrapper } from '@/features/live-video/shells/huddle/VideoStageWrapper';
import type { IntervalWrapperKind, WrapperBaseProps } from '@/features/live-video/wrappers/types';
import { WrapperErrorBoundary } from '@/features/live-video/wrappers/WrapperErrorBoundary';
import { getIntervalWrapper } from '@/features/live-video/wrappers/registry';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { huddleEditorVideoSplitStorageKey } from '@/lib/layout-collapse-keys';
import { useIsNarrowBelowMd } from '@/hooks/use-is-narrow-below-md';
import { isUuidString } from '@/lib/is-uuid';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { cn } from '@/lib/utils';
import { useLayoutCommands } from '@/components/layout/layout-command-context';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';

const HUDDLE_EDITOR_PANEL_ID = 'huddle-editor';
const HUDDLE_VIDEO_PANEL_ID = 'huddle-video';

function readHuddleEditorVideoLayout(workspaceId: string): Layout {
  const fallback: Layout = {
    [HUDDLE_EDITOR_PANEL_ID]: 35,
    [HUDDLE_VIDEO_PANEL_ID]: 65,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(huddleEditorVideoSplitStorageKey(workspaceId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Layout;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed[HUDDLE_EDITOR_PANEL_ID] === 'number' &&
      typeof parsed[HUDDLE_VIDEO_PANEL_ID] === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export type LiveSessionViewProps = {
  className?: string;
  /** Optional: runs after Agora `leaveChannel` (e.g. clear local UI). Leave must not end the shared session. */
  onAfterLeave?: () => void;
  localUserId: string;
  hostUserId: string;
  workspaceId: string;
  supabase: SupabaseClient;
  canWriteTasks: boolean;
  onWorkoutDeckPersisted?: () => void;
  /** Host: invoked after `actions.endSession()` (e.g. mark chat invite ended). */
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  /** Host: invoked with Start Session to begin Agora cloud recording (manual trigger). */
  onHostStartRecording?: (opts: {
    aspectRatio: SessionState['aspectRatio'];
  }) => void | Promise<void>;
  /**
   * When false, skips `get_live_session_join_hints` / `live_session_list_participants` until the
   * dashboard dock has finished `live_session_create` / `live_session_participant_join` so the
   * `live_sessions` row exists (avoids 400s from a connect-before-register race).
   */
  liveDbReady?: boolean;
  /** Shown in AMRAP roster / join RPC; defaults to `localUserId` when unset. */
  displayName?: string;
  /** Host-only (from dock): `class_recording` pipeline in progress (recording / uploading / processing). */
  hostClassRecordingPipelineBusy?: boolean;
  /**
   * Host + class-instance live only: whether `metadata.async_session` is active (async workout enabled).
   * When `false`, cloud recording is suppressed — UI may show a hint next to Start Session.
   */
  hostAsyncWorkoutEnabled?: boolean;
  /** Host deck pick mode: embedded Workouts Kanban from `dashboard-shell` (below deck strip). */
  boardSelectionPanel?: ReactNode;
  /** Host deck pick mode: mic/camera controls pinned above the selection footer. */
  selectionFloatingMediaBar?: ReactNode;
  /** Workouts bubble id for custom exercise injector (from `dashboard-shell`). */
  workoutsBubbleId?: string | null;
};

/**
 * "View 1 Lobby" — the live Huddle surface rendered once Agora is connected.
 *
 * Strict boundary: this view is intentionally video-first. The pre-join deck
 * builder (queue + exercise editor + Join CTA) lives in `PreJoinBuilder`;
 * the dock router picks between the two based on Agora connection state.
 */
function LiveSessionViewInner({
  className,
  onAfterLeave,
  localUserId,
  hostUserId,
  workspaceId,
  supabase,
  canWriteTasks,
  onWorkoutDeckPersisted,
  onHostEndLiveSessionForAll,
  onHostStartRecording,
  liveDbReady = true,
  displayName: displayNameProp,
  hostClassRecordingPipelineBusy = false,
  hostAsyncWorkoutEnabled,
  boardSelectionPanel,
  selectionFloatingMediaBar,
  workoutsBubbleId,
}: LiveSessionViewProps) {
  const { override } = useWrapperAttach();
  const { hostNavActions } = useHostNavActions();
  const { sessionDrawerNode } = useSessionDrawer();
  const {
    topLeftOverlay,
    topRightOverlay,
    stageBottomOverlay,
    localRailPipOverlay,
    renderRemoteRailBottomOverlay,
  } = useVideoOverlaySlots();

  const {
    state,
    actions,
    isHost,
    sessionId: liveSessionRowId,
    realtimeChannel,
    hostUserId: runtimeHostUserId,
    supabase: supabaseFromRuntime,
  } = useLiveSessionRuntime();
  const liveSessionId = liveSessionRowId.trim();
  const liveSessionRpcReady = Boolean(liveSessionId) && isUuidString(liveSessionId) && liveDbReady;

  const { client, leaveChannel, isMicMuted, isCameraOff, toggleMic } = useAgoraSession();

  const handleLeaveDock = useCallback(() => {
    leaveChannel();
    onAfterLeave?.();
  }, [leaveChannel, onAfterLeave]);

  const onRosterLocalMuteRequested = useCallback(() => {
    if (!isMicMuted) {
      toggleMic();
    }
    toast('Microphone muted', {
      description: 'The host has muted your microphone.',
    });
  }, [isMicMuted, toggleMic]);

  const { participants: rosterParticipants, sendRemoteMute } = useLiveSessionRoster({
    sessionId: liveSessionId,
    localUserId,
    hostUserId: runtimeHostUserId,
    supabase: supabaseFromRuntime,
    client,
    channel: realtimeChannel,
    localMediaState: { hasAudio: !isMicMuted, hasVideo: !isCameraOff },
    onLocalMuteRequested: onRosterLocalMuteRequested,
  });

  const { isSessionEnded, endedAt } = useSessionTeardown({
    realtimeChannel,
    hostUserId: runtimeHostUserId,
    sessionId: liveSessionId.length > 0 ? liveSessionId : null,
    leaveAgoraChannel: leaveChannel,
  });

  const { focusBoard } = useLayoutCommands();

  const deckSel = useWorkoutDeckSelectionOptional();
  const selectingFromBoard = Boolean(deckSel?.isSelectingFromBoard);
  const activeSnapshotId = deckSel?.activeSnapshotId ?? null;
  const compact = useIsNarrowBelowMd();

  const hostSideEditorOpen = isHost && activeSnapshotId != null;
  const participantLoggerOpen = !isHost && state.activeDeckItemId != null;
  const sideEditorOpen = hostSideEditorOpen || participantLoggerOpen;

  const selectionKey = isHost ? activeSnapshotId : state.activeDeckItemId;
  const { open: isDrawerOpen, onOpenChange: setDrawerOpen } = useTier3DrawerOpen({
    selectionKey,
    selectionActive: sideEditorOpen,
  });

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, [setDrawerOpen]);

  const uiMode = state.globalStartedAt != null || state.status !== 'idle' ? 'live' : 'builder';

  const { huddle } = useLiveTheaterLayoutPlanContext();

  const huddleSplitGroupRef = useGroupRef();

  const [huddleDefaultLayout, setHuddleDefaultLayout] = useState<Layout>(() => ({
    [HUDDLE_EDITOR_PANEL_ID]: 35,
    [HUDDLE_VIDEO_PANEL_ID]: 65,
  }));

  const [rosterOpen, setRosterOpen] = useState(false);

  useEffect(() => {
    setHuddleDefaultLayout(readHuddleEditorVideoLayout(workspaceId));
  }, [workspaceId]);

  const onHuddleSplitLayoutChanged = useCallback(
    (layout: Layout) => {
      try {
        localStorage.setItem(huddleEditorVideoSplitStorageKey(workspaceId), JSON.stringify(layout));
      } catch {
        /* ignore */
      }
    },
    [workspaceId],
  );

  /** Matches `public.live_sessions.id` (invite `sessionId` UUID), not Agora `channelId`. */
  const [wrapperKind, setWrapperKind] = useState<IntervalWrapperKind>('none');
  const [wrapperConfig, setWrapperConfig] = useState<unknown>(null);

  const effectiveWrapperKind: IntervalWrapperKind =
    override?.kind === 'amrap' || override?.kind === 'amrap_minimal' ? override.kind : wrapperKind;
  const effectiveWrapperConfig: unknown =
    override?.kind === 'amrap' || override?.kind === 'amrap_minimal'
      ? override.config
      : wrapperConfig;

  useEffect(() => {
    if (!liveSessionRpcReady) return;
    let cancelled = false;
    void supabase
      .rpc('get_live_session_join_hints', { p_session_id: liveSessionId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(
            '[LiveSessionView] get_live_session_join_hints',
            error.message,
            error.code,
            error.details,
            error.hint,
          );
          return;
        }
        if (data == null || typeof data !== 'object') return;
        const row = data as {
          interval_wrapper_kind?: string;
          interval_wrapper_config?: unknown;
        };
        setWrapperKind((row.interval_wrapper_kind as IntervalWrapperKind) ?? 'none');
        setWrapperConfig(row.interval_wrapper_config ?? null);
      });
    return () => {
      cancelled = true;
    };
    // `state.phase` is intentionally part of the deps: when the host transitions to a
    // wrapper-bearing phase (e.g. `amrap`), refetch hints as a backstop in case the
    // postgres_changes UPDATE arrived before the channel was fully subscribed.
  }, [liveSessionId, liveSessionRpcReady, supabase, state.phase]);

  useEffect(() => {
    if (!liveSessionRpcReady) return;
    const channel = supabase
      .channel(`live_session:${liveSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_sessions',
          filter: `id=eq.${liveSessionId}`,
        },
        (payload) => {
          const row = payload.new as {
            interval_wrapper_kind?: string;
            interval_wrapper_config?: unknown;
          };
          setWrapperKind((row.interval_wrapper_kind as IntervalWrapperKind) ?? 'none');
          setWrapperConfig(row.interval_wrapper_config ?? null);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [liveSessionId, liveSessionRpcReady, supabase]);

  const [hostParticipantId, setHostParticipantId] = useState<string | null>(null);

  useEffect(() => {
    if (!liveSessionRpcReady) return;
    let cancelled = false;
    void supabase
      .rpc('live_session_list_participants', { p_session_id: liveSessionId })
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data)) return;
        const rows = data as Array<{ role: string; agora_uid: string | null }>;
        const host = rows.find((r) => r.role === 'host');
        setHostParticipantId(host?.agora_uid ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [liveSessionId, liveSessionRpcReady, supabase]);

  // P2: `videoDrawerDefaultOpen = !entry?.hasVideoBackground` is N/A here (no separate video drawer); use registry metadata when a drawer shell exists.
  const entry = getIntervalWrapper(effectiveWrapperKind);
  const wrapperPhaseMatches =
    (effectiveWrapperKind === 'amrap' || effectiveWrapperKind === 'amrap_minimal') &&
    state.phase === 'amrap';
  const ActiveIntervalWrapper = wrapperPhaseMatches ? entry?.component : undefined;
  const renderWrapper = ActiveIntervalWrapper != null;
  const excludeUidForTiles = useExcludeUidForTiles(
    wrapperPhaseMatches ? effectiveWrapperKind : 'none',
    hostParticipantId,
  );
  const preferredShell = entry?.preferredShell;
  const showWrapperBoardSplit =
    !compact && preferredShell === 'theater_board_split' && wrapperPhaseMatches;
  const showSideEditor = !compact && sideEditorOpen && !showWrapperBoardSplit;
  const showTier3Column = isDrawerOpen && showSideEditor;
  const showHuddleSplit = !compact && (showWrapperBoardSplit || showTier3Column);
  const showReopenPill = !compact && !isDrawerOpen && sideEditorOpen;

  const resolvedDisplayName = displayNameProp?.trim() || localUserId;

  const wrapperProps: WrapperBaseProps = {
    intervalWrapperKind: effectiveWrapperKind,
    intervalWrapperConfig: effectiveWrapperConfig,
    hostParticipantId,
    videoTileExcludeUid: excludeUidForTiles,
    liveSessionId,
    participantId: String(agoraUidFromUuid(localUserId)),
    role: isHost ? 'host' : 'participant',
    displayName: resolvedDisplayName,
    authUserId: localUserId,
    onWrapperError: (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[LiveSessionView] interval wrapper error', err);
      }
    },
  };

  const videoFillsPrimarySlot =
    compact || showWrapperBoardSplit || !sideEditorOpen || (showSideEditor && !isDrawerOpen);

  const videoOverlays = useMemo(
    () => (
      <>
        <ActivePhaseOverlays state={state} />
        {topLeftOverlay}
        {topRightOverlay}
      </>
    ),
    [state, topLeftOverlay, topRightOverlay],
  );

  const rosterFloatingTrigger = useMemo(
    () => (
      <RosterDrawerTrigger
        count={rosterParticipants.length}
        isOpen={rosterOpen}
        onOpen={() => setRosterOpen((v) => !v)}
      />
    ),
    [rosterParticipants.length, rosterOpen],
  );

  const videoStage = useMemo(
    () => (
      <VideoStageWrapper
        className={cn('min-h-0', videoFillsPrimarySlot ? 'flex-1' : 'h-full min-h-0')}
        onAfterLeave={onAfterLeave}
        localUserId={localUserId}
        hostUserId={hostUserId}
        excludeUidForTiles={excludeUidForTiles}
        videoOverlays={videoOverlays}
        stageBottomOverlay={stageBottomOverlay}
        localRailPipOverlay={localRailPipOverlay}
        renderRemoteRailBottomOverlay={renderRemoteRailBottomOverlay}
        floatingMediaExtras={rosterFloatingTrigger}
      />
    ),
    [
      compact,
      sideEditorOpen,
      showWrapperBoardSplit,
      showSideEditor,
      isDrawerOpen,
      videoFillsPrimarySlot,
      onAfterLeave,
      localUserId,
      hostUserId,
      excludeUidForTiles,
      videoOverlays,
      stageBottomOverlay,
      localRailPipOverlay,
      renderRemoteRailBottomOverlay,
      rosterFloatingTrigger,
    ],
  );

  const workoutPlayer = useMemo(
    () =>
      isHost ? (
        <LiveSessionWorkoutPlayer
          className={compact ? 'min-h-0 flex-1' : 'h-full min-h-0'}
          workspaceId={workspaceId}
          supabase={supabase}
          canWrite={canWriteTasks}
          onPersistSuccess={onWorkoutDeckPersisted}
          onHostLayoutFocusBoard={focusBoard}
          onClose={handleDrawerClose}
        />
      ) : (
        <ParticipantWorkoutLogger
          className={compact ? 'min-h-0 flex-1' : 'h-full min-h-0'}
          onClose={handleDrawerClose}
        />
      ),
    [
      isHost,
      compact,
      workspaceId,
      supabase,
      canWriteTasks,
      onWorkoutDeckPersisted,
      focusBoard,
      handleDrawerClose,
    ],
  );

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      setDrawerOpen(open);
    },
    [setDrawerOpen],
  );

  const showEmbeddedBoardSelection = Boolean(selectingFromBoard && boardSelectionPanel != null);

  if (isSessionEnded) {
    const durationMs =
      endedAt != null && state.globalStartedAt != null
        ? endedAt - state.globalStartedAt
        : undefined;
    return (
      <>
        <PostSessionSummary
          stats={{ durationMs, participantCount: rosterParticipants.length }}
          isHost={isHost}
          onReturnToDashboard={() => useLiveVideoStore.getState().leaveSession()}
          className={className}
        />
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex h-full min-h-0 w-full flex-1 flex-col gap-4 p-4',
          huddle.useLegacySelectionScrollClamp &&
            selectingFromBoard &&
            'max-h-[min(72vh,680px)] overflow-y-auto',
          className,
        )}
      >
        <LiveSessionTopBar
          left={
            <SessionHeader
              className="min-w-0 border-b-0 pb-0 text-left"
              isSelectingFromBoard={selectingFromBoard}
              uiMode={uiMode}
              status={state.status}
            />
          }
          center={
            state.status !== 'idle' ? (
              <SessionClockMini
                state={state}
                compact
                className="mx-auto min-w-0 shrink-0 sm:mx-0"
              />
            ) : null
          }
          right={
            <SessionControlsActions
              state={state}
              actions={actions}
              disableActions={!isHost}
              onHostEndLiveSessionForAll={isHost ? onHostEndLiveSessionForAll : undefined}
              onHostStartRecording={isHost ? onHostStartRecording : undefined}
              onLeaveDock={onAfterLeave != null ? handleLeaveDock : undefined}
              liveDbReady={liveDbReady}
              hostClassRecordingPipelineBusy={isHost ? hostClassRecordingPipelineBusy : false}
              hostAsyncWorkoutEnabled={isHost ? hostAsyncWorkoutEnabled : undefined}
              hostNavActions={!showWrapperBoardSplit ? hostNavActions : null}
              hostDeckInjector={
                !selectingFromBoard && isHost && canWriteTasks ? (
                  <LiveDeckExerciseInjector
                    workspaceId={workspaceId}
                    workoutsBubbleId={workoutsBubbleId ?? null}
                    canWrite={canWriteTasks}
                  />
                ) : null
              }
              className="sm:justify-end"
            />
          }
        />

        {huddle.showWorkoutQueueStrip ? (
          <WorkoutQueueRegion
            state={state}
            uiMode={uiMode}
            selectingFromBoard={selectingFromBoard}
          />
        ) : null}

        {showEmbeddedBoardSelection ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {boardSelectionPanel}
          </div>
        ) : showHuddleSplit ? (
          <ResizablePanelGroup
            direction="horizontal"
            groupRef={huddleSplitGroupRef}
            id={`huddle-editor-video-${workspaceId}`}
            defaultLayout={huddleDefaultLayout}
            onLayoutChanged={onHuddleSplitLayoutChanged}
            className="min-h-0 flex-1 rounded-lg"
          >
            {showTier3Column || showWrapperBoardSplit ? (
              <>
                <ResizablePanel
                  id={HUDDLE_EDITOR_PANEL_ID}
                  minSize="22%"
                  maxSize="55%"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                >
                  {showWrapperBoardSplit && renderWrapper ? (
                    <div
                      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-background p-3 text-foreground"
                      data-region="interval-board-panel"
                    >
                      {hostNavActions != null ? (
                        <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-2 py-1 text-sm">
                          {hostNavActions}
                        </div>
                      ) : null}
                      {sessionDrawerNode != null ? (
                        <div className="shrink-0">{sessionDrawerNode}</div>
                      ) : null}
                      <div className="min-h-0 flex-1">
                        <WrapperErrorBoundary resetKey={effectiveWrapperKind}>
                          <ActiveIntervalWrapper {...wrapperProps} />
                        </WrapperErrorBoundary>
                      </div>
                    </div>
                  ) : (
                    workoutPlayer
                  )}
                </ResizablePanel>
                <ResizableHandle direction="horizontal" withHandle className="shrink-0" />
              </>
            ) : null}
            <ResizablePanel
              id={HUDDLE_VIDEO_PANEL_ID}
              minSize="45%"
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
                {videoStage}
                {showReopenPill ? (
                  <Tier3ExercisesReopenPill onClick={() => setDrawerOpen(true)} />
                ) : null}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {videoStage}
            {showReopenPill ? (
              <Tier3ExercisesReopenPill onClick={() => setDrawerOpen(true)} />
            ) : null}
          </div>
        )}
        {!showWrapperBoardSplit && !selectingFromBoard && sessionDrawerNode != null ? (
          <div className="shrink-0 rounded-lg border border-border bg-card/60 p-3">
            {sessionDrawerNode}
          </div>
        ) : null}
        {!showWrapperBoardSplit && !selectingFromBoard && renderWrapper ? (
          entry?.inlineUi === false ? (
            <div className="sr-only">
              <WrapperErrorBoundary resetKey={effectiveWrapperKind}>
                <ActiveIntervalWrapper {...wrapperProps} />
              </WrapperErrorBoundary>
            </div>
          ) : (
            <div className="shrink-0 rounded-lg border border-border bg-card/60 p-3 min-h-[120px]">
              <WrapperErrorBoundary resetKey={effectiveWrapperKind}>
                <ActiveIntervalWrapper {...wrapperProps} />
              </WrapperErrorBoundary>
            </div>
          )
        ) : null}
        {selectingFromBoard && deckSel ? (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-3">
            {selectionFloatingMediaBar != null ? (
              <div className="flex shrink-0 justify-center">{selectionFloatingMediaBar}</div>
            ) : null}
            <div className="flex shrink-0 justify-end">
              <Button
                type="button"
                size="lg"
                variant="default"
                className="font-semibold"
                onClick={() => deckSel.exitSelectionMode()}
              >
                Save to Workout
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {compact ? (
        <Sheet
          modal={false}
          open={isDrawerOpen && sideEditorOpen}
          onOpenChange={handleSheetOpenChange}
        >
          <SheetContent
            side="bottom"
            hideCloseButton
            className="flex h-[85vh] min-h-0 flex-col gap-0 p-0"
          >
            <div className="shrink-0 border-b border-border px-4 py-3">
              <SheetTitle>{isHost ? 'Edit exercises' : 'Log workout'}</SheetTitle>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-2">
              {workoutPlayer}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <RosterDrawer
        localUserId={localUserId}
        open={rosterOpen}
        onOpenChange={setRosterOpen}
        managedRoster={{ participants: rosterParticipants, sendRemoteMute }}
      />
    </>
  );
}

export function LiveSessionView(props: LiveSessionViewProps) {
  return (
    <TimerBackgroundProvider>
      <VideoOverlaySlotsProvider>
        <SessionDrawerProvider>
          <AmrapRailProvider>
            <WrapperAttachProvider>
              <HostNavActionsProvider>
                <LiveSessionViewInner {...props} />
              </HostNavActionsProvider>
            </WrapperAttachProvider>
          </AmrapRailProvider>
        </SessionDrawerProvider>
      </VideoOverlaySlotsProvider>
    </TimerBackgroundProvider>
  );
}
