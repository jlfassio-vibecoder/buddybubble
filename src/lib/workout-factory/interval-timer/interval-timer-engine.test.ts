import { describe, expect, it } from 'vitest';
import {
  createInitialIntervalTimerState,
  deriveIntervalTimerSnapshot,
  getPhaseRemainingMs,
  intervalTimerReducer,
} from '@/lib/workout-factory/interval-timer/interval-timer-engine';
import type { TabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';

const tabataConfig: TabataTimerConfig = {
  prepareMs: 0,
  workMs: 20_000,
  restMs: 10_000,
  totalRounds: 8,
};

function reduceAll(
  state: ReturnType<typeof createInitialIntervalTimerState>,
  actions: { type: string; now?: number }[],
) {
  let s = state;
  for (const a of actions) {
    s = intervalTimerReducer(s, a as Parameters<typeof intervalTimerReducer>[1]);
  }
  return s;
}

describe('intervalTimerReducer', () => {
  it('start with prepareMs 0 enters work at roundIndex 0', () => {
    const s0 = createInitialIntervalTimerState(tabataConfig);
    const s1 = intervalTimerReducer(s0, { type: 'start', now: 1000 });
    expect(s1.phase).toBe('work');
    expect(s1.roundIndex).toBe(0);
    expect(s1.phaseAnchorMs).toBe(1000);
  });

  it('start with prepareMs enters prepare first', () => {
    const cfg = { ...tabataConfig, prepareMs: 3000 };
    const s1 = intervalTimerReducer(createInitialIntervalTimerState(cfg), {
      type: 'start',
      now: 0,
    });
    expect(s1.phase).toBe('prepare');
    expect(s1.roundIndex).toBe(0);
  });

  it('tick at work end transitions to rest with same roundIndex', () => {
    let s = intervalTimerReducer(createInitialIntervalTimerState(tabataConfig), {
      type: 'start',
      now: 0,
    });
    s = intervalTimerReducer(s, { type: 'tick', now: 20_000 });
    expect(s.phase).toBe('rest');
    expect(s.roundIndex).toBe(0);
  });

  it('tick at rest end increments roundIndex and enters work', () => {
    let s = intervalTimerReducer(createInitialIntervalTimerState(tabataConfig), {
      type: 'start',
      now: 0,
    });
    s = intervalTimerReducer(s, { type: 'tick', now: 20_000 });
    s = intervalTimerReducer(s, { type: 'tick', now: 30_000 });
    expect(s.phase).toBe('work');
    expect(s.roundIndex).toBe(1);
  });

  it('final round rest complete enters done', () => {
    const cfg: TabataTimerConfig = { ...tabataConfig, totalRounds: 1 };
    let s = intervalTimerReducer(createInitialIntervalTimerState(cfg), { type: 'start', now: 0 });
    s = intervalTimerReducer(s, { type: 'tick', now: 20_000 });
    expect(s.phase).toBe('rest');
    s = intervalTimerReducer(s, { type: 'tick', now: 30_000 });
    expect(s.phase).toBe('done');
  });

  it('restMs 0 skips rest and advances work rounds', () => {
    const cfg: TabataTimerConfig = { ...tabataConfig, restMs: 0, totalRounds: 2 };
    let s = intervalTimerReducer(createInitialIntervalTimerState(cfg), { type: 'start', now: 0 });
    s = intervalTimerReducer(s, { type: 'tick', now: 20_000 });
    expect(s.phase).toBe('work');
    expect(s.roundIndex).toBe(1);
    s = intervalTimerReducer(s, { type: 'tick', now: 40_000 });
    expect(s.phase).toBe('done');
  });

  it('single tick fast-forwards missed Tabata phases after background', () => {
    const cfg: TabataTimerConfig = { ...tabataConfig, totalRounds: 2 };
    let s = intervalTimerReducer(createInitialIntervalTimerState(cfg), { type: 'start', now: 0 });
    s = intervalTimerReducer(s, { type: 'tick', now: 90_000 });
    expect(s.phase).toBe('done');
  });

  it('pause mid-work freezes remaining', () => {
    let s = intervalTimerReducer(createInitialIntervalTimerState(tabataConfig), {
      type: 'start',
      now: 0,
    });
    s = intervalTimerReducer(s, { type: 'pause', now: 5000 });
    expect(s.phase).toBe('paused');
    expect(getPhaseRemainingMs(s, 5000)).toBe(15_000);
    expect(getPhaseRemainingMs(s, 20_000)).toBe(15_000);
  });

  it('resume after pause preserves remaining', () => {
    let s = intervalTimerReducer(createInitialIntervalTimerState(tabataConfig), {
      type: 'start',
      now: 0,
    });
    s = intervalTimerReducer(s, { type: 'pause', now: 5000 });
    s = intervalTimerReducer(s, { type: 'resume', now: 10_000 });
    expect(s.phase).toBe('work');
    expect(getPhaseRemainingMs(s, 10_000)).toBe(15_000);
  });

  it('reset from done returns idle', () => {
    const cfg: TabataTimerConfig = { ...tabataConfig, totalRounds: 1 };
    let s = intervalTimerReducer(createInitialIntervalTimerState(cfg), { type: 'start', now: 0 });
    s = intervalTimerReducer(s, { type: 'tick', now: 20_000 });
    s = intervalTimerReducer(s, { type: 'tick', now: 30_000 });
    expect(s.phase).toBe('done');
    s = intervalTimerReducer(s, { type: 'reset' });
    expect(s.phase).toBe('idle');
  });

  it('getPhaseRemainingMs respects absolute now jumps', () => {
    const s = intervalTimerReducer(createInitialIntervalTimerState(tabataConfig), {
      type: 'start',
      now: 1000,
    });
    expect(getPhaseRemainingMs(s, 1500)).toBe(19_500);
    expect(getPhaseRemainingMs(s, 2000)).toBe(19_000);
  });
});

describe('deriveIntervalTimerSnapshot', () => {
  it('marks isRunning false when idle', () => {
    const snap = deriveIntervalTimerSnapshot(createInitialIntervalTimerState(tabataConfig), 0);
    expect(snap.isRunning).toBe(false);
    expect(snap.phase).toBe('idle');
  });

  it('displayRound is 1-based', () => {
    let s = intervalTimerReducer(createInitialIntervalTimerState(tabataConfig), {
      type: 'start',
      now: 0,
    });
    const snap = deriveIntervalTimerSnapshot(s, 0);
    expect(snap.displayRound).toBe(1);
  });
});
