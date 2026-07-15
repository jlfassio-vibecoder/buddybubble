import { describe, expect, it } from 'vitest';

import {
  TABATA_DEFAULT_SETUP_SECONDS,
  beginTabataSegmentTimer,
  buildInitialTabataMechanicsState,
  computeNextTabataMechanicsState,
  deriveTabataEffectiveRoundsForFinalize,
  deriveTabataLoggerActiveSet,
  deriveTabataSegmentRemainingSec,
  freezeTabataMechanicsStateForPause,
  isTabataMechanicsState,
  parseTabataMechanicsState,
  tabataBlockDurationSeconds,
  tabataSegmentDurationSec,
  tabataSegmentLabel,
  unfreezeTabataMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

const CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

describe('isTabataMechanicsState', () => {
  it('returns true for a valid Tabata object', () => {
    const state = buildInitialTabataMechanicsState(CONFIG);
    expect(isTabataMechanicsState(state)).toBe(true);
  });

  it('returns false for an EMOM-shaped object', () => {
    expect(
      isTabataMechanicsState({
        segment: 'minute',
        minute_index: 3,
        total_minutes: 10,
        interval_seconds: 60,
        setup_seconds: 10,
        segment_started_at: null,
      }),
    ).toBe(false);
  });

  it('returns false when segment is invalid despite Tabata-like keys', () => {
    expect(
      isTabataMechanicsState({
        segment: 'minute',
        round_index: 1,
        total_rounds: 8,
        work_seconds: 20,
        rest_seconds: 10,
        setup_seconds: 10,
        segment_started_at: null,
      }),
    ).toBe(false);
  });
});

describe('parseTabataMechanicsState', () => {
  it('parses valid state', () => {
    const parsed = parseTabataMechanicsState({
      segment: 'work',
      round_index: 3,
      total_rounds: 8,
      work_seconds: 20,
      rest_seconds: 10,
      setup_seconds: 10,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    });
    expect(parsed?.round_index).toBe(3);
    expect(parsed?.segment).toBe('work');
  });

  it('returns null for invalid segment', () => {
    expect(parseTabataMechanicsState({ segment: 'pause' })).toBeNull();
  });
});

describe('buildInitialTabataMechanicsState', () => {
  it('starts in setup with 10s and no anchor', () => {
    const state = buildInitialTabataMechanicsState(CONFIG);
    expect(state.segment).toBe('setup');
    expect(state.setup_seconds).toBe(TABATA_DEFAULT_SETUP_SECONDS);
    expect(state.segment_started_at).toBeNull();
    expect(state.round_index).toBe(0);
  });
});

describe('beginTabataSegmentTimer', () => {
  it('starts setup countdown without entering work', () => {
    const attached = buildInitialTabataMechanicsState(CONFIG);
    const started = beginTabataSegmentTimer(attached, Date.parse('2026-06-01T18:30:00.000Z'));
    expect(started.segment).toBe('setup');
    expect(started.round_index).toBe(0);
    expect(started.segment_started_at).not.toBeNull();
  });
});

describe('deriveTabataSegmentRemainingSec', () => {
  it('shows 10s setup before start', () => {
    const attached = buildInitialTabataMechanicsState(CONFIG);
    expect(deriveTabataSegmentRemainingSec(attached, Date.now())).toBe(10);
  });

  it('counts down setup segment from anchor', () => {
    const setup = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const now = new Date('2026-06-01T18:30:03.000Z').getTime();
    expect(deriveTabataSegmentRemainingSec(setup, now)).toBe(7);
  });

  it('counts down work segment from anchor', () => {
    const work = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const now = new Date('2026-06-01T18:30:05.000Z').getTime();
    expect(deriveTabataSegmentRemainingSec(work, now)).toBe(15);
  });
});

describe('computeNextTabataMechanicsState', () => {
  it('setup advances to work round 1', () => {
    const setup = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(setup, Date.parse('2026-06-01T18:30:10.000Z'));
    expect(next.segment).toBe('work');
    expect(next.round_index).toBe(1);
  });

  it('work round 1 advances to rest round 1', () => {
    const work = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(work, Date.parse('2026-06-01T18:30:20.000Z'));
    expect(next.segment).toBe('rest');
    expect(next.round_index).toBe(1);
  });

  it('work advances to next work when rest_seconds is 0', () => {
    const work = {
      ...buildInitialTabataMechanicsState({ totalRounds: 6, workSeconds: 45, restSeconds: 0 }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(work, Date.parse('2026-06-01T18:30:45.000Z'));
    expect(next.segment).toBe('work');
    expect(next.round_index).toBe(2);
  });

  it('rest round 7 advances to work round 8', () => {
    const rest = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'rest' as const,
      round_index: 7,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(rest, Date.parse('2026-06-01T18:30:10.000Z'));
    expect(next.segment).toBe('work');
    expect(next.round_index).toBe(8);
  });

  it('work on last round advances to done without trailing rest', () => {
    const work = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 8,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(work, Date.parse('2026-06-01T18:30:20.000Z'));
    expect(next.segment).toBe('done');
    expect(next.segment_started_at).toBeNull();
  });

  it('rest on last round advances to done', () => {
    const rest = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'rest' as const,
      round_index: 8,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(rest, Date.parse('2026-06-01T18:30:10.000Z'));
    expect(next.segment).toBe('done');
  });

  it('multi-station mid-pass uses station rest duration', () => {
    const work = {
      ...buildInitialTabataMechanicsState({
        totalRounds: 12,
        workSeconds: 40,
        restSeconds: 15,
        roundRestSeconds: 60,
        exerciseCount: 4,
      }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(work, Date.parse('2026-06-01T18:30:40.000Z'));
    expect(next.segment).toBe('rest');
    expect(tabataSegmentDurationSec(next)).toBe(15);
  });

  it('multi-station end-of-pass uses round rest duration', () => {
    const work = {
      ...buildInitialTabataMechanicsState({
        totalRounds: 12,
        workSeconds: 40,
        restSeconds: 15,
        roundRestSeconds: 60,
        exerciseCount: 4,
      }),
      segment: 'work' as const,
      round_index: 4,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(work, Date.parse('2026-06-01T18:30:40.000Z'));
    expect(next.segment).toBe('rest');
    expect(tabataSegmentDurationSec(next)).toBe(60);
  });

  it('zero station rest skips mid-pass but enters rest at end-of-pass', () => {
    const mid = {
      ...buildInitialTabataMechanicsState({
        totalRounds: 12,
        workSeconds: 30,
        restSeconds: 0,
        roundRestSeconds: 60,
        exerciseCount: 4,
      }),
      segment: 'work' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const midNext = computeNextTabataMechanicsState(mid, Date.parse('2026-06-01T18:30:30.000Z'));
    expect(midNext.segment).toBe('work');
    expect(midNext.round_index).toBe(3);

    const end = {
      ...mid,
      round_index: 4,
    };
    const endNext = computeNextTabataMechanicsState(end, Date.parse('2026-06-01T18:30:30.000Z'));
    expect(endNext.segment).toBe('rest');
    expect(tabataSegmentDurationSec(endNext)).toBe(60);
  });

  it('single-station ignores round_rest_seconds', () => {
    const work = {
      ...buildInitialTabataMechanicsState({
        totalRounds: 8,
        workSeconds: 30,
        restSeconds: 30,
        roundRestSeconds: 60,
        exerciseCount: 1,
      }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextTabataMechanicsState(work, Date.parse('2026-06-01T18:30:30.000Z'));
    expect(next.segment).toBe('rest');
    expect(tabataSegmentDurationSec(next)).toBe(30);
  });

  it('parse legacy mechanics without round fields defaults to station rest only', () => {
    const parsed = parseTabataMechanicsState({
      segment: 'rest',
      round_index: 4,
      total_rounds: 12,
      work_seconds: 40,
      rest_seconds: 15,
      setup_seconds: 10,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.round_rest_seconds).toBe(0);
    expect(parsed!.exercise_count).toBe(0);
    expect(tabataSegmentDurationSec(parsed!)).toBe(15);
  });
});

describe('polymorphic pause', () => {
  it('freezes remaining at pause moment (20s work, 8s elapsed → 12s left)', () => {
    const work = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const pauseAt = Date.parse('2026-06-01T18:30:08.000Z');
    const frozen = freezeTabataMechanicsStateForPause(work, pauseAt);
    expect(frozen.is_paused).toBe(true);
    expect(frozen.elapsed_in_segment).toBe(8);
    expect(deriveTabataSegmentRemainingSec(frozen, pauseAt)).toBe(12);
    expect(deriveTabataSegmentRemainingSec(frozen, pauseAt + 5 * 60_000)).toBe(12);
  });

  it('resume rewinds anchor so countdown continues from frozen elapsed', () => {
    const paused = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
      is_paused: true as const,
      elapsed_in_segment: 8,
    };
    const resumeAt = Date.parse('2026-06-01T19:00:00.000Z');
    const resumed = unfreezeTabataMechanicsStateForResume(paused, resumeAt);
    expect(resumed.is_paused).toBeUndefined();
    expect(deriveTabataSegmentRemainingSec(resumed, resumeAt)).toBe(12);
    expect(deriveTabataSegmentRemainingSec(resumed, resumeAt + 1000)).toBe(11);
  });
});

describe('tabataBlockDurationSeconds', () => {
  it('computes 10s setup + 8x20/10 total', () => {
    const attached = buildInitialTabataMechanicsState(CONFIG);
    expect(tabataBlockDurationSeconds(attached)).toBe(10 + 8 * 20 + 7 * 10);
  });
});

describe('tabataSegmentLabel', () => {
  it('labels setup as Get Ready', () => {
    expect(tabataSegmentLabel('setup')).toBe('Get Ready');
  });
});

describe('deriveTabataLoggerActiveSet', () => {
  it('returns work highlight during anchored work segment', () => {
    const work = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(deriveTabataLoggerActiveSet(work)).toEqual({ setNumber: 2, phase: 'work' });
  });

  it('returns paused highlight when frozen', () => {
    const paused = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:12.000Z',
      is_paused: true as const,
    };
    expect(deriveTabataLoggerActiveSet(paused)).toEqual({ setNumber: 2, phase: 'paused' });
  });

  it('returns null during rest', () => {
    const rest = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'rest' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:32.000Z',
    };
    expect(deriveTabataLoggerActiveSet(rest)).toBeNull();
  });

  it('returns circuit-aware set number and exercise index for multi-exercise', () => {
    const work = {
      ...buildInitialTabataMechanicsState({ totalRounds: 12, workSeconds: 30, restSeconds: 30 }),
      segment: 'work' as const,
      round_index: 5,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(deriveTabataLoggerActiveSet(work, 4)).toEqual({
      setNumber: 2,
      phase: 'work',
      activeExerciseIndex: 0,
    });
  });
});

describe('deriveTabataEffectiveRoundsForFinalize', () => {
  it('falls back to total_rounds when round_index is 0', () => {
    const state = buildInitialTabataMechanicsState(CONFIG);
    expect(deriveTabataEffectiveRoundsForFinalize(state)).toBe(8);
  });

  it('uses round_index for partial block', () => {
    const state = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'rest' as const,
      round_index: 3,
      segment_started_at: '2026-06-01T18:30:10.000Z',
    };
    expect(deriveTabataEffectiveRoundsForFinalize(state)).toBe(3);
  });

  it('uses round_index when block completes', () => {
    const state = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'done' as const,
      round_index: 8,
      segment_started_at: null,
    };
    expect(deriveTabataEffectiveRoundsForFinalize(state)).toBe(8);
  });

  it('tracks FSM position through setup to work rounds', () => {
    const t0 = Date.parse('2026-06-01T18:30:00.000Z');
    const attached = buildInitialTabataMechanicsState(CONFIG);
    expect(deriveTabataEffectiveRoundsForFinalize(attached)).toBe(8);

    const started = beginTabataSegmentTimer(attached, t0);
    const work1 = computeNextTabataMechanicsState(started, t0 + 10_000);
    expect(work1.segment).toBe('work');
    expect(work1.round_index).toBe(1);
    expect(deriveTabataEffectiveRoundsForFinalize(work1)).toBe(1);

    const rest1 = computeNextTabataMechanicsState(work1, t0 + 30_000);
    expect(rest1.segment).toBe('rest');
    expect(deriveTabataEffectiveRoundsForFinalize(rest1)).toBe(1);

    const work2 = computeNextTabataMechanicsState(rest1, t0 + 40_000);
    expect(work2.round_index).toBe(2);
    expect(deriveTabataEffectiveRoundsForFinalize(work2)).toBe(2);
  });
});
