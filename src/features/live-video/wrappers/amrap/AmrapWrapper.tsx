'use client';

import { useEffect, useRef, useState } from 'react';

import AmrapHostActions from '@/features/amrap/components/AmrapHostActions';
import AmrapLogRoundOverlay from '@/features/amrap/components/AmrapLogRoundOverlay';
import AmrapResultsDrawer from '@/features/amrap/components/AmrapResultsDrawer';
import AmrapTimerOverlay from '@/features/amrap/components/AmrapTimerOverlay';
import ViewResultsModal from '@/features/amrap/components/ViewResultsModal';
import AmrapWhosHere from '@/features/amrap/components/AmrapWhosHere';
import { useAmrapSession } from '@/features/amrap/hooks/useAmrapSession';
import { useChatDrawer } from '@/features/live-video/contexts/ChatDrawerContext';
import { useHostNavActions } from '@/features/live-video/contexts/HostNavActionsContext';
import { useSessionDrawer } from '@/features/live-video/contexts/SessionDrawerContext';
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

  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    if (engine.timerPhase !== 'finished') setRecapDismissed(false);
  }, [engine.timerPhase]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  const { setSessionDrawerNode } = useSessionDrawer();
  const { setChatDrawerLeaderboard } = useChatDrawer();
  const { setHostNavActions } = useHostNavActions();
  const { setTopLeftOverlay, setTopRightOverlay } = useVideoOverlaySlots();

  useEffect(() => {
    setSessionDrawerNode(<AmrapWhosHere participants={engine.participants} />);
    return () => setSessionDrawerNode(null);
  }, [engine.participants, setSessionDrawerNode]);

  useEffect(() => {
    setChatDrawerLeaderboard(
      <AmrapResultsDrawer amrapSessionId={amrapSessionId} engine={engineRef.current} />,
    );
    return () => setChatDrawerLeaderboard(null);
  }, [
    amrapSessionId,
    engine.participants,
    engine.timerPhase,
    engine.workStartedAt,
    engine.blockSnapshot,
    setChatDrawerLeaderboard,
  ]);

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
  }, [engine.selfParticipant?.rounds, engine.timerPhase, engine.logRound, setTopRightOverlay]);

  const ps = engine.pageState;

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-white" data-region="interval-amrap">
      <ViewResultsModal
        isOpen={ps.showViewResultsModal}
        onClose={ps.handleCloseViewResults}
        isHost={ps.isHost}
        resultsText={ps.viewResultsText}
        onCopy={() => void ps.copyResults()}
        copyToast={ps.copyResultsToast}
        roundDurations={ps.roundDurations}
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
