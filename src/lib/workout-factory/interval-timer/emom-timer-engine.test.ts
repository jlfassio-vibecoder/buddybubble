import { describe, expect, it } from 'vitest';
import {
  createInitialEmomTimerState,
  deriveEmomTimerSnapshot,
  emomTimerReducer,
  getEmomRemainingMs,
} from './emom-timer-engine';
import type { EmomTimerConfig } from './resolve-emom-timer-config';

const emomConfig: EmomTimerConfig = {
  intervalMs: 60_000,
  totalRounds: 3,
  intervalSeconds: 60,
  alternatingStations: null,
};

const alternatingEmomConfig: EmomTimerConfig = {
  intervalMs: 60_000,
  totalRounds: 12,
  intervalSeconds: 60,
  alternatingStations: [[0], [1, 2]],
};

describe('emomTimerReducer', () => {
  it('start enters running at roundIndex 0', () => {
    const s0 = createInitialEmomTimerState(emomConfig);
    const s1 = emomTimerReducer(s0, { type: 'start', now: 1000 });
    expect(s1.phase).toBe('running');
    expect(s1.roundIndex).toBe(0);
    expect(s1.phaseAnchorMs).toBe(1000);
    expect(getEmomRemainingMs(s1, 1000)).toBe(60_000);
  });

  it('tick at interval end increments roundIndex and resets anchor', () => {
    let s = emomTimerReducer(createInitialEmomTimerState(emomConfig), {
      type: 'start',
      now: 0,
    });
    s = emomTimerReducer(s, { type: 'tick', now: 60_000 });
    expect(s.phase).toBe('running');
    expect(s.roundIndex).toBe(1);
    expect(s.phaseAnchorMs).toBe(60_000);
    expect(getEmomRemainingMs(s, 60_000)).toBe(60_000);
  });

  it('tick at last interval end transitions to done', () => {
    let s = emomTimerReducer(createInitialEmomTimerState(emomConfig), {
      type: 'start',
      now: 0,
    });
    s = emomTimerReducer(s, { type: 'tick', now: 60_000 });
    s = emomTimerReducer(s, { type: 'tick', now: 120_000 });
    s = emomTimerReducer(s, { type: 'tick', now: 180_000 });
    expect(s.phase).toBe('done');
    expect(s.roundIndex).toBe(2);
  });

  it('pause and resume preserve remaining without skipping round', () => {
    let s = emomTimerReducer(createInitialEmomTimerState(emomConfig), {
      type: 'start',
      now: 0,
    });
    s = emomTimerReducer(s, { type: 'pause', now: 10_000 });
    expect(getEmomRemainingMs(s, 20_000)).toBe(50_000);
    s = emomTimerReducer(s, { type: 'resume', now: 15_000 });
    expect(s.phase).toBe('running');
    expect(getEmomRemainingMs(s, 20_000)).toBe(45_000);
  });

  it('reset returns to idle', () => {
    let s = emomTimerReducer(createInitialEmomTimerState(emomConfig), {
      type: 'start',
      now: 0,
    });
    s = emomTimerReducer(s, { type: 'reset' });
    expect(s.phase).toBe('idle');
    expect(s.roundIndex).toBe(0);
  });

  it('deriveEmomTimerSnapshot idle shows full interval and displayRound 1', () => {
    const s = createInitialEmomTimerState(emomConfig);
    const snap = deriveEmomTimerSnapshot(s, 0);
    expect(snap.phase).toBe('idle');
    expect(snap.remainingMs).toBe(60_000);
    expect(snap.displayRound).toBe(1);
    expect(snap.isRunning).toBe(false);
    expect(snap.activeStationIndices).toBeNull();
  });

  it('deriveEmomTimerSnapshot exposes activeStationIndices for alternating config', () => {
    let s = emomTimerReducer(createInitialEmomTimerState(alternatingEmomConfig), {
      type: 'start',
      now: 0,
    });
    expect(deriveEmomTimerSnapshot(s, 0).activeStationIndices).toEqual([0]);
    s = emomTimerReducer(s, { type: 'tick', now: 60_000 });
    expect(deriveEmomTimerSnapshot(s, 60_000).activeStationIndices).toEqual([1, 2]);
    s = emomTimerReducer(s, { type: 'tick', now: 120_000 });
    expect(deriveEmomTimerSnapshot(s, 120_000).activeStationIndices).toEqual([0]);
  });
});
