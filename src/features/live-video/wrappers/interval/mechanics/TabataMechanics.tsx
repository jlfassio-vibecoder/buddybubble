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
  isTabataMechanicsState,
  isTabataSegmentElapsed,
  isTabataTimerFrozen,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import { useTabataBlockPauseSync } from '@/features/live-video/wrappers/interval/mechanics/useTabataBlockPauseSync';
import { useTabataOverlayAudio } from '@/features/live-video/wrappers/interval/mechanics/useTabataOverlayAudio';
import { useTabataOverlayPause } from '@/features/live-video/wrappers/interval/mechanics/useTabataOverlayPause';
import { useTabataWorkSetSync } from '@/features/live-video/wrappers/interval/mechanics/useTabataWorkSetSync';
import type { IntervalMechanicsContext } from '@/features/live-video/wrappers/interval/types/interval-engine';

export function TabataMechanics({
  engine,
  intervalSessionId: _intervalSessionId,
  liveSessionId,
  isHost,
  authUserId,
  supabase,
  onWrapperError,
}: IntervalMechanicsContext) {
  const { state } = useLiveSessionRuntime();

  useTabataBlockPauseSync({
    isHost,
    sessionStatus: state.status,
    engine,
  });

  useTabataWorkSetSync({
    engine,
    liveSessionId,
    userId: authUserId,
    supabase,
    isHost,
  });

  const engineRef = useRef(engine);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  const advancingRef = useRef(false);

  const tabataState = useMemo(
    () => (isTabataMechanicsState(engine.mechanicsState) ? engine.mechanicsState : null),
    [engine.mechanicsState],
  );

  useEffect(() => {
    if (!isHost || !engine.advanceSegment || !tabataState) return;
    if (state.status === 'paused') return;
    if (!isTabataHostAutoAdvanceSegment(tabataState)) return;

    const check = () => {
      const e = engineRef.current;
      const ms = isTabataMechanicsState(e.mechanicsState) ? e.mechanicsState : null;
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
  }, [isHost, state.status, engine.advanceSegment, engine.timerPhase, tabataState]);

  useTabataOverlayAudio(engine);

  const overlayPause = useTabataOverlayPause({
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
    setHostNavActions(<TabataHostActions engine={e} />);
    return () => setHostNavActions(null);
  }, [engine.startTimer, engine.resetTimer, engine.timerPhase, setHostNavActions]);

  useEffect(() => {
    setTopLeftOverlay(
      <TabataTimerOverlay
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
    engine.blockSnapshot?.format_params,
    engine.blockSnapshot?.exercises,
    tabataState?.segment,
    tabataState?.is_paused,
    tabataState?.round_index,
    overlayPause.showHostControls,
    overlayPause.canPause,
    overlayPause.canResume,
    setTopLeftOverlay,
  ]);

  useEffect(() => {
    if (engine.error) onWrapperError?.(engine.error);
  }, [engine.error, onWrapperError]);

  return <div className="sr-only" data-region="interval-tabata-mechanics" />;
}
