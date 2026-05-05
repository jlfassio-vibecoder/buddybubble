'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Layout } from 'react-resizable-panels';
import { useGroupRef } from 'react-resizable-panels';
import {
  ChatDrawerProvider,
  useChatDrawer,
} from '@/features/live-video/contexts/ChatDrawerContext';
import {
  HostNavActionsProvider,
  useHostNavActions,
} from '@/features/live-video/contexts/HostNavActionsContext';
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
import { useExcludeUidForTiles } from '@/features/live-video/hooks/useExcludeUidForTiles';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import { SessionControls } from '@/features/live-video/shells/huddle/SessionControls';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { Button } from '@/components/ui/button';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { ParticipantWorkoutLogger } from '@/features/live-video/shells/ParticipantWorkoutLogger';
import { ActivePhaseOverlays } from '@/features/live-video/shells/huddle/ActivePhaseOverlays';
import { VideoStageWrapper } from '@/features/live-video/shells/huddle/VideoStageWrapper';
import type { IntervalWrapperKind, WrapperBaseProps } from '@/features/live-video/wrappers/types';
import { WrapperErrorBoundary } from '@/features/live-video/wrappers/WrapperErrorBoundary';
import { getIntervalWrapper } from '@/features/live-video/wrappers/registry';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { huddleEditorVideoSplitStorageKey } from '@/lib/layout-collapse-keys';
import { useIsNarrowBelowMd } from '@/hooks/use-is-narrow-below-md';
import { isUuidString } from '@/lib/is-uuid';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { cn } from '@/lib/utils';
import { useLayoutCommands } from '@/components/layout/layout-command-context';

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
  /**
   * When false, skips `get_live_session_join_hints` / `live_session_list_participants` until the
   * dashboard dock has finished `live_session_create` / `live_session_participant_join` so the
   * `live_sessions` row exists (avoids 400s from a connect-before-register race).
   */
  liveDbReady?: boolean;
  /** Shown in AMRAP roster / join RPC; defaults to `localUserId` when unset. */
  displayName?: string;
  /** Host-only (from dock): `class_recording.status === 'processing'` for cloud recording UX. */
  hostClassRecordingProcessing?: boolean;
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
  liveDbReady = true,
  displayName: displayNameProp,
  hostClassRecordingProcessing = false,
}: LiveSessionViewProps) {
  const { override } = useWrapperAttach();
  const { hostNavActions } = useHostNavActions();
  const { sessionDrawerNode } = useSessionDrawer();
  const { chatDrawerLeaderboard } = useChatDrawer();
  const {
    topLeftOverlay,
    topRightOverlay,
    stageBottomOverlay,
    localRailPipOverlay,
    renderRemoteRailBottomOverlay,
  } = useVideoOverlaySlots();

  const { state, actions, isHost, sessionId: liveSessionRowId } = useLiveSessionRuntime();
  const { focusBoard } = useLayoutCommands();

  const deckSel = useWorkoutDeckSelectionOptional();
  const selectingFromBoard = Boolean(deckSel?.isSelectingFromBoard);
  const activeSnapshotId = deckSel?.activeSnapshotId ?? null;
  const compact = useIsNarrowBelowMd();

  const hostSideEditorOpen = isHost && activeSnapshotId != null;
  const participantLoggerOpen = !isHost && state.activeDeckItemId != null;
  const sideEditorOpen = hostSideEditorOpen || participantLoggerOpen;

  const uiMode = state.globalStartedAt != null || state.status !== 'idle' ? 'live' : 'builder';

  const { huddle } = useLiveTheaterLayoutPlanContext();

  const huddleSplitGroupRef = useGroupRef();

  const [huddleDefaultLayout, setHuddleDefaultLayout] = useState<Layout>(() => ({
    [HUDDLE_EDITOR_PANEL_ID]: 35,
    [HUDDLE_VIDEO_PANEL_ID]: 65,
  }));

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
  const liveSessionId = liveSessionRowId.trim();
  const liveSessionRpcReady = Boolean(liveSessionId) && isUuidString(liveSessionId) && liveDbReady;

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
    compact || (!sideEditorOpen && !showWrapperBoardSplit) || showWrapperBoardSplit;

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
      />
    ),
    [
      compact,
      sideEditorOpen,
      showWrapperBoardSplit,
      videoFillsPrimarySlot,
      onAfterLeave,
      localUserId,
      hostUserId,
      excludeUidForTiles,
      videoOverlays,
      stageBottomOverlay,
      localRailPipOverlay,
      renderRemoteRailBottomOverlay,
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
        />
      ) : (
        <ParticipantWorkoutLogger className={compact ? 'min-h-0 flex-1' : 'h-full min-h-0'} />
      ),
    [isHost, compact, workspaceId, supabase, canWriteTasks, onWorkoutDeckPersisted, focusBoard],
  );

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isHost) {
        deckSel?.setActiveSnapshotId(null);
      }
    },
    [deckSel, isHost],
  );

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
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
            <SessionHeader
              className="min-w-0 flex-1 border-b-0 pb-0 text-left"
              isSelectingFromBoard={selectingFromBoard}
              uiMode={uiMode}
            />
            {!showWrapperBoardSplit && hostNavActions != null ? (
              <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-2 py-1 text-sm">
                {hostNavActions}
              </div>
            ) : null}
          </div>
        </div>
        {/*
         * Wide + selected card: resizable editor | video. Otherwise video fills
         * the flex row. Aspect ratio lock stays inside VideoStageWrapper.
         */}
        {showSideEditor || showWrapperBoardSplit ? (
          <ResizablePanelGroup
            direction="horizontal"
            groupRef={huddleSplitGroupRef}
            id={`huddle-editor-video-${workspaceId}`}
            defaultLayout={huddleDefaultLayout}
            onLayoutChanged={onHuddleSplitLayoutChanged}
            className="min-h-0 flex-1 rounded-lg"
          >
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
                  {chatDrawerLeaderboard != null ? (
                    <div className="shrink-0">{chatDrawerLeaderboard}</div>
                  ) : null}
                </div>
              ) : (
                workoutPlayer
              )}
            </ResizablePanel>
            <ResizableHandle direction="horizontal" withHandle className="shrink-0" />
            <ResizablePanel
              id={HUDDLE_VIDEO_PANEL_ID}
              minSize="45%"
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{videoStage}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          videoStage
        )}
        {!showWrapperBoardSplit && sessionDrawerNode != null ? (
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
        {selectingFromBoard ? null : (
          <SessionControls
            state={state}
            actions={actions}
            disableActions={!isHost}
            onHostEndLiveSessionForAll={isHost ? onHostEndLiveSessionForAll : undefined}
            liveDbReady={liveDbReady}
            hostClassRecordingProcessing={isHost ? hostClassRecordingProcessing : false}
            className="shrink-0"
          />
        )}
        {selectingFromBoard ? null : wrapperPhaseMatches ? (
          chatDrawerLeaderboard != null ? (
            <div className="shrink-0 rounded-lg border border-border bg-card/60 p-3">
              {chatDrawerLeaderboard}
            </div>
          ) : null
        ) : (
          <SessionDeckBuilder state={state} className="shrink-0" />
        )}
        {selectingFromBoard && deckSel ? (
          <div className="flex shrink-0 justify-end border-t border-border pt-3">
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
        ) : null}
      </div>

      {compact ? (
        <Sheet open={sideEditorOpen} onOpenChange={handleSheetOpenChange}>
          <SheetContent side="bottom" className="flex h-[85vh] min-h-0 flex-col gap-0 p-0">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <SheetTitle>{isHost ? 'Edit exercises' : 'Log workout'}</SheetTitle>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-2">
              {workoutPlayer}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}

export function LiveSessionView(props: LiveSessionViewProps) {
  return (
    <TimerBackgroundProvider>
      <VideoOverlaySlotsProvider>
        <SessionDrawerProvider>
          <ChatDrawerProvider>
            <WrapperAttachProvider>
              <HostNavActionsProvider>
                <LiveSessionViewInner {...props} />
              </HostNavActionsProvider>
            </WrapperAttachProvider>
          </ChatDrawerProvider>
        </SessionDrawerProvider>
      </VideoOverlaySlotsProvider>
    </TimerBackgroundProvider>
  );
}
