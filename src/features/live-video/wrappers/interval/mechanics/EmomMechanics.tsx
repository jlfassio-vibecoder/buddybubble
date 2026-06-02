'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useHostNavActions } from '@/features/live-video/contexts/HostNavActionsContext';
import { useVideoOverlaySlots } from '@/features/live-video/contexts/VideoOverlaySlotsContext';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import EmomHostActions from '@/features/live-video/wrappers/interval/mechanics/EmomHostActions';
import EmomTimerOverlay from '@/features/live-video/wrappers/interval/mechanics/EmomTimerOverlay';
import {
  computeNextEmomMechanicsState,
  isEmomHostAutoAdvanceSegment,
  isEmomSegmentElapsed,
  isEmomTimerFrozen,
  type EmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import { useEmomBlockPauseSync } from '@/features/live-video/wrappers/interval/mechanics/useEmomBlockPauseSync';
import type { IntervalMechanicsContext } from '@/features/live-video/wrappers/interval/types/interval-engine';

function isEmomState(ms: unknown): ms is EmomMechanicsState {
  return ms != null && typeof ms === 'object' && 'minute_index' in ms && 'total_minutes' in ms;
}

export function EmomMechanics({
  engine,
  intervalSessionId: _intervalSessionId,
  liveSessionId: _liveSessionId,
  isHost,
  authUserId: _authUserId,
  supabase: _supabase,
  onWrapperError,
}: IntervalMechanicsContext) {
  const { state } = useLiveSessionRuntime();

  useEmomBlockPauseSync({
    isHost,
    sessionStatus: state.status,
    engine,
  });

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  const advancingRef = useRef(false);
  const emomState = useMemo(
    () => (isEmomState(engine.mechanicsState) ? engine.mechanicsState : null),
    [engine.mechanicsState],
  );

  useEffect(() => {
    if (!isHost || !engine.advanceSegment || !emomState) return;
    if (state.status === 'paused') return;
    if (!isEmomHostAutoAdvanceSegment(emomState)) return;

    const check = () => {
      const e = engineRef.current;
      const ms = isEmomState(e.mechanicsState) ? e.mechanicsState : null;
      if (!ms || !e.advanceSegment || advancingRef.current) return;
      if (isEmomTimerFrozen(ms)) return;
      if (!isEmomSegmentElapsed(ms, Date.now())) return;

      advancingRef.current = true;
      const next = computeNextEmomMechanicsState(ms, Date.now());
      void e.advanceSegment(next).finally(() => {
        advancingRef.current = false;
      });
    };

    check();
    const id = window.setInterval(check, 200);
    return () => window.clearInterval(id);
  }, [isHost, state.status, engine.advanceSegment, engine.timerPhase, emomState]);

  const { setHostNavActions } = useHostNavActions();
  const { setTopLeftOverlay } = useVideoOverlaySlots();

  useEffect(() => {
    if (!engine.startTimer && !engine.resetTimer) {
      setHostNavActions(null);
      return;
    }
    setHostNavActions(<EmomHostActions engine={engine} />);
    return () => setHostNavActions(null);
  }, [engine, engine.startTimer, engine.resetTimer, engine.timerPhase, setHostNavActions]);

  useEffect(() => {
    setTopLeftOverlay(<EmomTimerOverlay engine={engine} />);
    return () => setTopLeftOverlay(null);
  }, [
    engine,
    engine.remainingSec,
    engine.timerPhase,
    engine.segmentLabel,
    engine.currentRoundIndex,
    emomState?.segment,
    emomState?.is_paused,
    emomState?.minute_index,
    setTopLeftOverlay,
  ]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  return <div className="sr-only" data-region="interval-emom-mechanics" />;
}
