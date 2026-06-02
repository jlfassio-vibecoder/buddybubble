'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import ViewResultsModal from '@/features/amrap/components/ViewResultsModal';
import { useIntervalSession } from '@/features/live-video/wrappers/interval/hooks/useIntervalSession';
import type { IntervalMechanicsContext } from '@/features/live-video/wrappers/interval/types/interval-engine';
import { emptyAmrapRailState, useAmrapRail } from '@/features/live-video/contexts/AmrapRailContext';
import { parseIntervalSessionIdFromWrapperConfig } from '@/features/live-video/wrappers/parseWrapperConfig';
import type { WrapperBaseProps } from '@/features/live-video/wrappers/types';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';

export type BaseIntervalWrapperProps = WrapperBaseProps & {
  renderMechanics: (ctx: IntervalMechanicsContext) => ReactNode;
};

function BaseIntervalBody({
  intervalSessionId,
  liveSessionId,
  role,
  displayName,
  authUserId,
  onWrapperError,
  renderMechanics,
}: {
  intervalSessionId: string;
  renderMechanics: (ctx: IntervalMechanicsContext) => ReactNode;
} & Omit<
  WrapperBaseProps,
  | 'intervalWrapperConfig'
  | 'intervalWrapperKind'
  | 'videoTileExcludeUid'
  | 'hostParticipantId'
  | 'participantId'
>) {
  const [recapDismissed, setRecapDismissed] = useState(false);

  const engine = useIntervalSession({
    intervalSessionId,
    liveSessionId,
    displayName,
    authUserId,
    role,
    onDismissFinishedRecap: () => setRecapDismissed(true),
    recapDismissed,
  });

  const { supabase, isHost } = useLiveSessionRuntime();

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  const { setAmrapRail } = useAmrapRail();

  useEffect(() => {
    setAmrapRail({
      amrapSessionId: intervalSessionId,
      engine: engineRef.current,
      isHost,
    });
    return () => setAmrapRail(emptyAmrapRailState);
  }, [
    intervalSessionId,
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

  const mechanicsCtx = useMemo<IntervalMechanicsContext>(
    () => ({
      engine,
      intervalSessionId,
      liveSessionId,
      isHost,
      authUserId,
      supabase,
      onWrapperError,
    }),
    [engine, intervalSessionId, liveSessionId, isHost, authUserId, supabase, onWrapperError],
  );

  const ps = engine.pageState;

  return (
    <>
      {renderMechanics(mechanicsCtx)}
      <div className="sr-only" data-region="interval-wrapper">
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
    </>
  );
}

export function BaseIntervalWrapper({
  intervalWrapperConfig,
  intervalWrapperKind: _intervalWrapperKind,
  renderMechanics,
  ...rest
}: BaseIntervalWrapperProps) {
  const intervalSessionId = parseIntervalSessionIdFromWrapperConfig(intervalWrapperConfig);

  if (!intervalSessionId) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Missing interval session. Ask the host to restart the block.
      </div>
    );
  }

  return (
    <BaseIntervalBody
      intervalSessionId={intervalSessionId}
      renderMechanics={renderMechanics}
      {...rest}
    />
  );
}
