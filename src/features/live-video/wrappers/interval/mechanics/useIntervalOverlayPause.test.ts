import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { buildInitialTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import {
  resolveIntervalOverlayPauseVisibility,
  useIntervalOverlayPause,
} from '@/features/live-video/wrappers/interval/mechanics/useIntervalOverlayPause';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import {
  freezeTabataMechanicsStateForPause,
  isTabataHostAutoAdvanceSegment,
  isTabataSegmentRunnable,
  isTabataTimerFrozen,
  parseTabataMechanicsState,
  unfreezeTabataMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

const CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

function workState() {
  return {
    ...buildInitialTabataMechanicsState(CONFIG),
    segment: 'work' as const,
    round_index: 2,
    segment_started_at: '2026-06-01T18:30:12.000Z',
  };
}

function makeEngine(mechanicsState = workState()): IntervalSessionEngine {
  return {
    timerPhase: 'work',
    mechanicsState,
    advanceSegment: vi.fn().mockResolvedValue(undefined),
  } as unknown as IntervalSessionEngine;
}

describe('resolveIntervalOverlayPauseVisibility', () => {
  const base = {
    parseState: parseTabataMechanicsState,
    isRunnable: isTabataSegmentRunnable,
    isHostAutoAdvance: isTabataHostAutoAdvanceSegment,
    isTimerFrozen: isTabataTimerFrozen,
    hasAdvanceSegment: true,
    timerPhase: 'work' as const,
    mechanicsState: workState(),
  };

  it('allows host pause during anchored work', () => {
    const result = resolveIntervalOverlayPauseVisibility({
      ...base,
      isHost: true,
      sessionStatus: 'running',
    });
    expect(result.showHostControls).toBe(true);
    expect(result.canPause).toBe(true);
    expect(result.canResume).toBe(false);
  });

  it('hides controls for non-host', () => {
    const result = resolveIntervalOverlayPauseVisibility({
      ...base,
      isHost: false,
      sessionStatus: 'running',
    });
    expect(result.showHostControls).toBe(false);
    expect(result.canPause).toBe(false);
  });

  it('hides controls when session is globally paused', () => {
    const result = resolveIntervalOverlayPauseVisibility({
      ...base,
      isHost: true,
      sessionStatus: 'paused',
    });
    expect(result.showHostControls).toBe(false);
    expect(result.canPause).toBe(false);
  });

  it('shows resume when mechanics are frozen', () => {
    const paused = freezeTabataMechanicsStateForPause(workState(), Date.now());
    const result = resolveIntervalOverlayPauseVisibility({
      ...base,
      mechanicsState: paused,
      isHost: true,
      sessionStatus: 'running',
    });
    expect(result.canPause).toBe(false);
    expect(result.canResume).toBe(true);
    expect(result.isFrozen).toBe(true);
  });

  it('is idempotent when already frozen (freeze returns same state)', () => {
    const paused = freezeTabataMechanicsStateForPause(workState(), Date.now());
    const again = freezeTabataMechanicsStateForPause(paused, Date.now());
    expect(again).toEqual(paused);
  });
});

describe('useIntervalOverlayPause', () => {
  it('calls advanceSegment with frozen state on pause', async () => {
    const engine = makeEngine();
    const { result } = renderHook(() =>
      useIntervalOverlayPause({
        isHost: true,
        sessionStatus: 'running',
        engine,
        parseState: parseTabataMechanicsState,
        isRunnable: isTabataSegmentRunnable,
        isHostAutoAdvance: isTabataHostAutoAdvanceSegment,
        isTimerFrozen: isTabataTimerFrozen,
        freeze: freezeTabataMechanicsStateForPause,
        unfreeze: unfreezeTabataMechanicsStateForResume,
      }),
    );

    act(() => {
      result.current.pause();
    });

    await vi.waitFor(() => {
      expect(engine.advanceSegment).toHaveBeenCalledTimes(1);
    });
    const arg = vi.mocked(engine.advanceSegment!).mock.calls[0][0];
    expect(arg.is_paused).toBe(true);
  });

  it('no-ops pause for non-host', () => {
    const engine = makeEngine();
    const { result } = renderHook(() =>
      useIntervalOverlayPause({
        isHost: false,
        sessionStatus: 'running',
        engine,
        parseState: parseTabataMechanicsState,
        isRunnable: isTabataSegmentRunnable,
        isHostAutoAdvance: isTabataHostAutoAdvanceSegment,
        isTimerFrozen: isTabataTimerFrozen,
        freeze: freezeTabataMechanicsStateForPause,
        unfreeze: unfreezeTabataMechanicsStateForResume,
      }),
    );

    act(() => {
      result.current.pause();
    });
    expect(engine.advanceSegment).not.toHaveBeenCalled();
  });

  it('keeps stable pause and resume callback references across engine ticks', () => {
    const engine = makeEngine();
    const { result, rerender } = renderHook(
      ({ remainingSec }) =>
        useIntervalOverlayPause({
          isHost: true,
          sessionStatus: 'running',
          engine: { ...engine, remainingSec } as IntervalSessionEngine,
          parseState: parseTabataMechanicsState,
          isRunnable: isTabataSegmentRunnable,
          isHostAutoAdvance: isTabataHostAutoAdvanceSegment,
          isTimerFrozen: isTabataTimerFrozen,
          freeze: freezeTabataMechanicsStateForPause,
          unfreeze: unfreezeTabataMechanicsStateForResume,
        }),
      { initialProps: { remainingSec: 20 } },
    );

    const initialPause = result.current.pause;
    const initialResume = result.current.resume;

    rerender({ remainingSec: 19 });
    rerender({ remainingSec: 18 });

    expect(result.current.pause).toBe(initialPause);
    expect(result.current.resume).toBe(initialResume);
  });
});
