'use client';

import { useEffect, useMemo, useRef } from 'react';

import AmrapHostActions from '@/features/amrap/components/AmrapHostActions';
import AmrapLogRoundOverlay from '@/features/amrap/components/AmrapLogRoundOverlay';
import AmrapTimerOverlay from '@/features/amrap/components/AmrapTimerOverlay';
import { useAmrapSetDuplication } from '@/features/amrap/hooks/useAmrapSetDuplication';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useHostNavActions } from '@/features/live-video/contexts/HostNavActionsContext';
import { useVideoOverlaySlots } from '@/features/live-video/contexts/VideoOverlaySlotsContext';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import type { IntervalMechanicsContext } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function AmrapMechanics({
  engine,
  intervalSessionId: _intervalSessionId,
  liveSessionId,
  isHost,
  authUserId,
  supabase,
  onWrapperError,
}: IntervalMechanicsContext) {
  const { state } = useLiveSessionRuntime();
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

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  return <div className="sr-only" data-region="interval-amrap-mechanics" />;
}
