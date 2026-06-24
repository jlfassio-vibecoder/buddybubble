import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { SessionStatus } from '@/features/live-video/state/sessionStateMachine';
import {
  buildInitialTabataMechanicsState,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import { useTabataBlockPauseSync } from '@/features/live-video/wrappers/interval/mechanics/useTabataBlockPauseSync';
import { shouldSyncTabataWorkSet } from '@/features/live-video/wrappers/interval/mechanics/tabata-work-set-sync';
import type { IntervalSessionEngine } from '@/features/live-video/wrappers/interval/types/interval-engine';
import {
  freezeTabataMechanicsStateForPause,
  unfreezeTabataMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

const CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

function workState(): TabataMechanicsState {
  return {
    ...buildInitialTabataMechanicsState(CONFIG),
    segment: 'work' as const,
    round_index: 2,
    segment_started_at: '2026-06-01T18:30:12.000Z',
  };
}

function makeEngine(mechanicsState: TabataMechanicsState = workState()): IntervalSessionEngine {
  return {
    mechanicsState,
    advanceSegment: vi.fn().mockResolvedValue(undefined),
  } as unknown as IntervalSessionEngine;
}

describe('useTabataBlockPauseSync', () => {
  it('freezes mechanics when session transitions running to paused', async () => {
    const engine = makeEngine();
    const { rerender } = renderHook(
      ({ status }: { status: SessionStatus }) =>
        useTabataBlockPauseSync({
          isHost: true,
          sessionStatus: status,
          engine,
        }),
      { initialProps: { status: 'running' as SessionStatus } },
    );

    rerender({ status: 'paused' });

    await vi.waitFor(() => {
      expect(engine.advanceSegment).toHaveBeenCalledTimes(1);
    });
    const frozen = vi.mocked(engine.advanceSegment!).mock.calls[0][0];
    expect(frozen.is_paused).toBe(true);
  });

  it('unfreezes mechanics when session transitions paused to running', async () => {
    const paused = freezeTabataMechanicsStateForPause(workState(), Date.now());
    const engine = makeEngine(paused);
    const { rerender } = renderHook(
      ({ status }: { status: SessionStatus }) =>
        useTabataBlockPauseSync({
          isHost: true,
          sessionStatus: status,
          engine,
        }),
      { initialProps: { status: 'paused' as SessionStatus } },
    );

    rerender({ status: 'running' });

    await vi.waitFor(() => {
      expect(engine.advanceSegment).toHaveBeenCalledTimes(1);
    });
    const resumed = vi.mocked(engine.advanceSegment!).mock.calls[0][0];
    expect(resumed.is_paused).toBeUndefined();
  });

  it('does not double-freeze when already overlay-paused', () => {
    const paused = freezeTabataMechanicsStateForPause(workState(), Date.now());
    const again = freezeTabataMechanicsStateForPause(paused, Date.now());
    expect(again).toEqual(paused);
  });

  it('global resume unfreezes overlay-paused state', () => {
    const paused = freezeTabataMechanicsStateForPause(workState(), Date.now());
    const resumeAt = Date.parse('2026-06-01T19:00:00.000Z');
    const resumed = unfreezeTabataMechanicsStateForResume(paused, resumeAt);
    expect(resumed.is_paused).toBeUndefined();
    expect(resumed.segment_started_at).toBeTruthy();
  });
});

describe('pause and work-set sync', () => {
  it('does not sync work sets while paused', () => {
    const paused = freezeTabataMechanicsStateForPause(workState(), Date.now());
    expect(shouldSyncTabataWorkSet(paused)).toBe(false);
  });
});
