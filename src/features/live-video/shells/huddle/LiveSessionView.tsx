'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Layout } from 'react-resizable-panels';
import { useGroupRef } from 'react-resizable-panels';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlanContext } from '@/features/live-video/theater/live-theater-layout-context';
import { SessionHeader } from '@/features/live-video/shells/huddle/SessionHeader';
import { SessionControls } from '@/features/live-video/shells/huddle/SessionControls';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { LiveSessionWorkoutPlayer } from '@/features/live-video/shells/huddle/LiveSessionWorkoutPlayer';
import { ParticipantWorkoutLogger } from '@/features/live-video/shells/ParticipantWorkoutLogger';
import { ActivePhaseOverlays } from '@/features/live-video/shells/huddle/ActivePhaseOverlays';
import { VideoStageWrapper } from '@/features/live-video/shells/huddle/VideoStageWrapper';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { huddleEditorVideoSplitStorageKey } from '@/lib/layout-collapse-keys';
import { useIsNarrowBelowMd } from '@/hooks/use-is-narrow-below-md';
import { cn } from '@/lib/utils';

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
};

/**
 * "View 1 Lobby" — the live Huddle surface rendered once Agora is connected.
 *
 * Strict boundary: this view is intentionally video-first. The pre-join deck
 * builder (queue + exercise editor + Join CTA) lives in `PreJoinBuilder`;
 * the dock router picks between the two based on Agora connection state.
 */
export function LiveSessionView({
  className,
  onAfterLeave,
  localUserId,
  hostUserId,
  workspaceId,
  supabase,
  canWriteTasks,
  onWorkoutDeckPersisted,
  onHostEndLiveSessionForAll,
}: LiveSessionViewProps) {
  const { state, actions, isHost } = useLiveSessionRuntime();

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

  const videoStage = useMemo(
    () => (
      <VideoStageWrapper
        className={cn('min-h-0', compact || !sideEditorOpen ? 'flex-1' : 'h-full min-h-0')}
        onAfterLeave={onAfterLeave}
        localUserId={localUserId}
        hostUserId={hostUserId}
        videoOverlays={<ActivePhaseOverlays state={state} />}
      />
    ),
    [compact, sideEditorOpen, onAfterLeave, localUserId, hostUserId, state],
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
        />
      ) : (
        <ParticipantWorkoutLogger className={compact ? 'min-h-0 flex-1' : 'h-full min-h-0'} />
      ),
    [isHost, compact, workspaceId, supabase, canWriteTasks, onWorkoutDeckPersisted],
  );

  const showSideEditor = !compact && sideEditorOpen;

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
        <SessionHeader
          className="shrink-0"
          isSelectingFromBoard={selectingFromBoard}
          uiMode={uiMode}
        />
        {/*
         * Wide + selected card: resizable editor | video. Otherwise video fills
         * the flex row. Aspect ratio lock stays inside VideoStageWrapper.
         */}
        {showSideEditor ? (
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
              {workoutPlayer}
            </ResizablePanel>
            <ResizableHandle direction="horizontal" withHandle className="shrink-0" />
            <ResizablePanel
              id={HUDDLE_VIDEO_PANEL_ID}
              minSize="45%"
              className="flex min-h-0 min-w-0 flex-col overflow-hidden"
            >
              {videoStage}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          videoStage
        )}
        {selectingFromBoard ? null : (
          <SessionControls
            state={state}
            actions={actions}
            disableActions={!isHost}
            onHostEndLiveSessionForAll={isHost ? onHostEndLiveSessionForAll : undefined}
            className="shrink-0"
          />
        )}
        {selectingFromBoard ? null : <SessionDeckBuilder state={state} className="shrink-0" />}
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
