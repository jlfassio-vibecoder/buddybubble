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
  parseEmomMechanicsState,
  type EmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import { useEmomBlockPauseSync } from '@/features/live-video/wrappers/interval/mechanics/useEmomBlockPauseSync';
import { useEmomOverlayAudio } from '@/features/live-video/wrappers/interval/mechanics/useEmomOverlayAudio';
import { useEmomOverlayPause } from '@/features/live-video/wrappers/interval/mechanics/useEmomOverlayPause';
import type { IntervalMechanicsContext } from '@/features/live-video/wrappers/interval/types/interval-engine';

function isEmomState(ms: unknown): ms is EmomMechanicsState {
  return parseEmomMechanicsState(ms) != null;
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

  useEmomOverlayAudio(engine);

  const overlayPause = useEmomOverlayPause({
    isHost,
    sessionStatus: state.status,
    engine,
  });

  const { setHostNavActions } = useHostNavActions();
  const { setTopLeftOverlay } = useVideoOverlaySlots();

  useEffect(() => {
    const e = engineRef.current;
    if (!e.startTimer && !e.resetTimer) {
      setHostNavActions(null);
      return;
    }
    setHostNavActions(<EmomHostActions engine={e} />);
    return () => setHostNavActions(null);
  }, [engine.startTimer, engine.resetTimer, engine.timerPhase, setHostNavActions]);

  useEffect(() => {
    setTopLeftOverlay(
      <EmomTimerOverlay
        engine={engine}
        showHostControls={overlayPause.showHostControls}
        canPause={overlayPause.canPause}
        canResume={overlayPause.canResume}
        onPause={overlayPause.pause}
        onResume={overlayPause.resume}
      />,
    );
    return () => setTopLeftOverlay(null);
  }, [
    engine.remainingSec,
    engine.totalSec,
    engine.timerPhase,
    engine.segmentLabel,
    engine.currentRoundIndex,
    emomState?.segment,
    emomState?.is_paused,
    emomState?.minute_index,
    overlayPause.showHostControls,
    overlayPause.canPause,
    overlayPause.canResume,
    setTopLeftOverlay,
  ]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  return <div className="sr-only" data-region="interval-emom-mechanics" />;
}
