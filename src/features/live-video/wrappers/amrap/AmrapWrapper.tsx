'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import AmrapHostActions from '@/features/amrap/components/AmrapHostActions';
import AmrapLogRoundOverlay from '@/features/amrap/components/AmrapLogRoundOverlay';
import AmrapTimerOverlay from '@/features/amrap/components/AmrapTimerOverlay';
import ViewResultsModal from '@/features/amrap/components/ViewResultsModal';
import { useAmrapSetDuplication } from '@/features/amrap/hooks/useAmrapSetDuplication';
import { useAmrapSession } from '@/features/amrap/hooks/useAmrapSession';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { emptyAmrapRailState, useAmrapRail } from '@/features/live-video/contexts/AmrapRailContext';
import { useHostNavActions } from '@/features/live-video/contexts/HostNavActionsContext';
import { useVideoOverlaySlots } from '@/features/live-video/contexts/VideoOverlaySlotsContext';
import { parseAmrapSessionIdFromWrapperConfig } from '@/features/live-video/wrappers/parseWrapperConfig';
import type { WrapperBaseProps } from '@/features/live-video/wrappers/types';

function AmrapBody({
  amrapSessionId,
  liveSessionId,
  role,
  displayName,
  authUserId,
  onWrapperError,
}: { amrapSessionId: string } & Omit<
  WrapperBaseProps,
  | 'intervalWrapperConfig'
  | 'intervalWrapperKind'
  | 'videoTileExcludeUid'
  | 'hostParticipantId'
  | 'participantId'
>) {
  const [recapDismissed, setRecapDismissed] = useState(false);

  const engine = useAmrapSession({
    amrapSessionId,
    liveSessionId,
    displayName,
    authUserId,
    role,
    onDismissFinishedRecap: () => setRecapDismissed(true),
    recapDismissed,
  });

  const { state, supabase, isHost } = useLiveSessionRuntime();
  const deck = useLiveSessionDeck({
    supabase,
    sessionId: liveSessionId,
    enabled: Boolean(liveSessionId.trim()),
  });
  const activeRow = useMemo(
    () => deck.rows.find((r) => r.id === state.activeDeckItemId) ?? null,
    [deck.rows, state.activeDeckItemId],
  );
  const activeTask = activeRow?.tasks ?? null;

  useAmrapSetDuplication({
    engine,
    liveSessionId,
    activeTask,
    userId: authUserId,
    supabase,
    isHost,
  });

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  const { setAmrapRail } = useAmrapRail();

  useEffect(() => {
    setAmrapRail({
      amrapSessionId,
      engine: engineRef.current,
      isHost,
    });
    return () => setAmrapRail(emptyAmrapRailState);
  }, [
    amrapSessionId,
    isHost,
    setAmrapRail,
    engine.participants,
    engine.timerPhase,
    engine.participantRoundLaps,
    engine.workStartedAt,
    engine.leaderboardSnapshotRaw,
    engine.resultsFinalizedAt,
    engine.selfParticipant?.workoutLogTaskId,
  ]);

  useEffect(() => {
    if (engine.timerPhase !== 'finished') setRecapDismissed(false);
  }, [engine.timerPhase]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  const { setHostNavActions } = useHostNavActions();
  const { setTopLeftOverlay, setTopRightOverlay } = useVideoOverlaySlots();

  useEffect(() => {
    const e = engineRef.current;
    if (!e.startTimer && !e.resetTimer) {
      setHostNavActions(null);
      return;
    }
    setHostNavActions(<AmrapHostActions engine={e} />);
    return () => setHostNavActions(null);
  }, [engine.startTimer, engine.resetTimer, engine.timerPhase, setHostNavActions]);

  useEffect(() => {
    setTopLeftOverlay(<AmrapTimerOverlay engine={engineRef.current} />);
    return () => setTopLeftOverlay(null);
  }, [engine.remainingSec, engine.timerPhase, engine.totalSec, setTopLeftOverlay]);

  useEffect(() => {
    setTopRightOverlay(<AmrapLogRoundOverlay engine={engineRef.current} />);
    return () => setTopRightOverlay(null);
  }, [
    engine.selfParticipant?.rounds,
    engine.participantRoundLaps,
    engine.timerPhase,
    engine.logRound,
    setTopRightOverlay,
  ]);

  const ps = engine.pageState;

  return (
    <div className="sr-only" data-region="interval-amrap">
      <ViewResultsModal
        isOpen={ps.showViewResultsModal}
        onClose={ps.handleCloseViewResults}
        isHost={ps.isHost}
        resultsText={ps.viewResultsText}
        onCopy={() => void ps.copyResults()}
        copyToast={ps.copyResultsToast}
        roundDurations={ps.roundDurations}
        savedToAnalytics={ps.savedToAnalytics}
      />
    </div>
  );
}

export default function AmrapWrapper(props: WrapperBaseProps) {
  const { intervalWrapperConfig, intervalWrapperKind: _intervalWrapperKind, ...rest } = props;
  const amrapSessionId = parseAmrapSessionIdFromWrapperConfig(intervalWrapperConfig);

  if (!amrapSessionId) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Missing AMRAP session. Ask the host to restart AMRAP.
      </div>
    );
  }

  return <AmrapBody amrapSessionId={amrapSessionId} {...rest} />;
}
