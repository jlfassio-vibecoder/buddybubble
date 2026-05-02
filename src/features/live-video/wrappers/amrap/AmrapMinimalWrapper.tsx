'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import AmrapHostActions from '@/features/amrap/components/AmrapHostActions';
import AmrapLogRoundOverlay from '@/features/amrap/components/AmrapLogRoundOverlay';
import AmrapResultsDrawer from '@/features/amrap/components/AmrapResultsDrawer';
import AmrapRoundLapsOverlay from '@/features/amrap/components/AmrapRoundLapsOverlay';
import AmrapTimerOverlay from '@/features/amrap/components/AmrapTimerOverlay';
import ViewResultsModal from '@/features/amrap/components/ViewResultsModal';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { useAmrapSetDuplication } from '@/features/amrap/hooks/useAmrapSetDuplication';
import { useAmrapSession } from '@/features/amrap/hooks/useAmrapSession';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useChatDrawer } from '@/features/live-video/contexts/ChatDrawerContext';
import { useHostNavActions } from '@/features/live-video/contexts/HostNavActionsContext';
import { useVideoOverlaySlots } from '@/features/live-video/contexts/VideoOverlaySlotsContext';
import { agoraUidFromUuid } from '@/lib/live-video/agora-uid';
import { parseAmrapSessionIdFromWrapperConfig } from '@/features/live-video/wrappers/parseWrapperConfig';
import type { WrapperBaseProps } from '@/features/live-video/wrappers/types';

function amrapParticipantIdForAgoraUid(
  engine: AmrapSessionEngine,
  agoraUidStr: string,
): string | null {
  const uid = Number(agoraUidStr);
  if (!Number.isFinite(uid)) return null;
  for (const p of engine.participants) {
    if (p.userId != null && agoraUidFromUuid(p.userId) === uid) return p.id;
  }
  return null;
}

function hasLapsForParticipant(engine: AmrapSessionEngine, participantId: string): boolean {
  const g = engine.participantRoundLaps.find((p) => p.participantId === participantId);
  return Boolean(g && g.entries.length > 0);
}

function AmrapMinimalBody({
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
  engineRef.current = engine;

  const { setChatDrawerLeaderboard } = useChatDrawer();

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
    if (engine.timerPhase !== 'finished') setRecapDismissed(false);
  }, [engine.timerPhase]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  const { setHostNavActions } = useHostNavActions();
  const {
    setTopLeftOverlay,
    setTopRightOverlay,
    setStageBottomOverlay,
    setLocalRailPipOverlay,
    setRemoteRailBottomOverlaySlot,
  } = useVideoOverlaySlots();

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

  const lapStamp = engine.participantRoundLaps
    .map(
      (p) =>
        `${p.participantId}:${p.entries.map((x) => `${x.round}:${x.durationLabel}`).join(';')}`,
    )
    .join('|');

  useEffect(() => {
    const e = engineRef.current;
    const hasAnyLaps = e.participantRoundLaps.some((p) => p.entries.length > 0);

    if (!hasAnyLaps) {
      setStageBottomOverlay(null);
      setLocalRailPipOverlay(null);
      setRemoteRailBottomOverlaySlot(null);
      return () => {
        setStageBottomOverlay(null);
        setLocalRailPipOverlay(null);
        setRemoteRailBottomOverlaySlot(null);
      };
    }

    const selfId = e.selfParticipant?.id ?? null;
    const hostParticipant = e.participants.find((p) => p.isHost) ?? null;
    const hostAmrapId = hostParticipant?.id ?? null;

    if (role === 'host') {
      setStageBottomOverlay(
        selfId && hasLapsForParticipant(e, selfId) ? (
          <AmrapRoundLapsOverlay
            variant="host-stage-bottom"
            engine={e}
            filterToParticipantId={selfId}
          />
        ) : null,
      );
      setLocalRailPipOverlay(null);
    } else {
      setStageBottomOverlay(
        hostAmrapId && hasLapsForParticipant(e, hostAmrapId) ? (
          <AmrapRoundLapsOverlay
            variant="host-stage-bottom"
            engine={e}
            filterToParticipantId={hostAmrapId}
          />
        ) : null,
      );
      setLocalRailPipOverlay(
        selfId && hasLapsForParticipant(e, selfId) ? (
          <AmrapRoundLapsOverlay
            variant="participant-pip-bottom-right"
            engine={e}
            filterToParticipantId={selfId}
          />
        ) : null,
      );
    }

    setRemoteRailBottomOverlaySlot({
      render: (agoraUidStr) => {
        const e2 = engineRef.current;
        const rid = amrapParticipantIdForAgoraUid(e2, agoraUidStr);
        if (!rid || !hasLapsForParticipant(e2, rid)) return null;
        return (
          <AmrapRoundLapsOverlay
            variant="participant-pip-bottom-right"
            engine={e2}
            filterToParticipantId={rid}
          />
        );
      },
    });

    return () => {
      setStageBottomOverlay(null);
      setLocalRailPipOverlay(null);
      setRemoteRailBottomOverlaySlot(null);
    };
  }, [
    role,
    lapStamp,
    setStageBottomOverlay,
    setLocalRailPipOverlay,
    setRemoteRailBottomOverlaySlot,
  ]);

  const ps = engine.pageState;

  return (
    <div className="sr-only" data-region="interval-amrap-minimal">
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

export default function AmrapMinimalWrapper(props: WrapperBaseProps) {
  const { intervalWrapperConfig, intervalWrapperKind: _intervalWrapperKind, ...rest } = props;
  const amrapSessionId = parseAmrapSessionIdFromWrapperConfig(intervalWrapperConfig);

  if (!amrapSessionId) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Missing AMRAP session. Ask the host to restart AMRAP.
      </div>
    );
  }

  return <AmrapMinimalBody amrapSessionId={amrapSessionId} {...rest} />;
}
