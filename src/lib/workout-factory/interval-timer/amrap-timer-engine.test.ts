import { describe, expect, it } from 'vitest';
import {
  amrapTimerReducer,
  createInitialAmrapTimerState,
  deriveAmrapTimerSnapshot,
  getAmrapRemainingMs,
} from '@/lib/workout-factory/interval-timer/amrap-timer-engine';
import type { AmrapTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-amrap-timer-config';

const config: AmrapTimerConfig = {
  timeCapMs: 60_000,
  targetRounds: null,
};

describe('amrapTimerReducer', () => {
  it('start enters running with anchor', () => {
    const s0 = createInitialAmrapTimerState(config);
    const s1 = amrapTimerReducer(s0, { type: 'start', now: 1000 });
    expect(s1.phase).toBe('running');
    expect(s1.phaseAnchorMs).toBe(1000);
  });

  it('tick at cap enters done', () => {
    let s = amrapTimerReducer(createInitialAmrapTimerState(config), { type: 'start', now: 0 });
    s = amrapTimerReducer(s, { type: 'tick', now: 60_000 });
    expect(s.phase).toBe('done');
    expect(getAmrapRemainingMs(s, 60_000)).toBe(0);
  });

  it('pause mid-run freezes remaining', () => {
    let s = amrapTimerReducer(createInitialAmrapTimerState(config), { type: 'start', now: 0 });
    s = amrapTimerReducer(s, { type: 'pause', now: 10_000 });
    expect(s.phase).toBe('paused');
    expect(getAmrapRemainingMs(s, 20_000)).toBe(50_000);
    expect(getAmrapRemainingMs(s, 30_000)).toBe(50_000);
  });

  it('resume after pause preserves remaining', () => {
    let s = amrapTimerReducer(createInitialAmrapTimerState(config), { type: 'start', now: 0 });
    s = amrapTimerReducer(s, { type: 'pause', now: 10_000 });
    s = amrapTimerReducer(s, { type: 'resume', now: 15_000 });
    expect(s.phase).toBe('running');
    expect(getAmrapRemainingMs(s, 15_000)).toBe(50_000);
  });

  it('reset from done returns idle', () => {
    let s = amrapTimerReducer(createInitialAmrapTimerState(config), { type: 'start', now: 0 });
    s = amrapTimerReducer(s, { type: 'tick', now: 60_000 });
    s = amrapTimerReducer(s, { type: 'reset' });
    expect(s.phase).toBe('idle');
  });
});

describe('deriveAmrapTimerSnapshot', () => {
  it('elapsedMs increases while running', () => {
    const s = amrapTimerReducer(createInitialAmrapTimerState(config), { type: 'start', now: 0 });
    const snap = deriveAmrapTimerSnapshot(s, 5000);
    expect(snap.elapsedMs).toBe(5000);
    expect(snap.remainingMs).toBe(55_000);
    expect(snap.isRunning).toBe(true);
  });
});
