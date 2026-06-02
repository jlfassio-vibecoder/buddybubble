'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useHostNavActions } from '@/features/live-video/contexts/HostNavActionsContext';
import { useVideoOverlaySlots } from '@/features/live-video/contexts/VideoOverlaySlotsContext';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import TabataHostActions from '@/features/live-video/wrappers/interval/mechanics/TabataHostActions';
import TabataTimerOverlay from '@/features/live-video/wrappers/interval/mechanics/TabataTimerOverlay';
import {
  computeNextTabataMechanicsState,
  isTabataHostAutoAdvanceSegment,
  isTabataSegmentElapsed,
  isTabataTimerFrozen,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import { useTabataBlockPauseSync } from '@/features/live-video/wrappers/interval/mechanics/useTabataBlockPauseSync';
import type { IntervalMechanicsContext } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function TabataMechanics({
  engine,
  intervalSessionId: _intervalSessionId,
  liveSessionId: _liveSessionId,
  isHost,
  authUserId: _authUserId,
  supabase: _supabase,
  onWrapperError,
}: IntervalMechanicsContext) {
  const { state } = useLiveSessionRuntime();

  useTabataBlockPauseSync({
    isHost,
    sessionStatus: state.status,
    engine,
  });

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  const advancingRef = useRef(false);

  useEffect(() => {
    if (!isHost || !engine.advanceSegment || !engine.mechanicsState) return;
    if (state.status === 'paused') return;
    if (!isTabataHostAutoAdvanceSegment(engine.mechanicsState)) return;

    const check = () => {
      const e = engineRef.current;
      const ms = e.mechanicsState;
      if (!ms || !e.advanceSegment || advancingRef.current) return;
      if (isTabataTimerFrozen(ms)) return;
      if (!isTabataSegmentElapsed(ms, Date.now())) return;

      advancingRef.current = true;
      const next = computeNextTabataMechanicsState(ms, Date.now());
      void e.advanceSegment(next).finally(() => {
        advancingRef.current = false;
      });
    };

    check();
    const id = window.setInterval(check, 200);
    return () => window.clearInterval(id);
  }, [isHost, state.status, engine.advanceSegment, engine.timerPhase, engine.mechanicsState]);

  const { setHostNavActions } = useHostNavActions();
  const { setTopLeftOverlay } = useVideoOverlaySlots();

  useEffect(() => {
    const e = engineRef.current;
    if (!e.startTimer && !e.resetTimer) {
      setHostNavActions(null);
      return;
    }
    setHostNavActions(<TabataHostActions engine={e} />);
    return () => setHostNavActions(null);
  }, [engine.startTimer, engine.resetTimer, engine.timerPhase, setHostNavActions]);

  useEffect(() => {
    setTopLeftOverlay(<TabataTimerOverlay engine={engineRef.current} />);
    return () => setTopLeftOverlay(null);
  }, [
    engine.remainingSec,
    engine.timerPhase,
    engine.segmentLabel,
    engine.currentRoundIndex,
    engine.mechanicsState?.segment,
    engine.mechanicsState?.is_paused,
    setTopLeftOverlay,
  ]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  return <div className="sr-only" data-region="interval-tabata-mechanics" />;
}
