import { describe, expect, it } from 'vitest';

import {
  TABATA_DEFAULT_SETUP_SECONDS,
  beginTabataSegmentTimer,
  buildInitialTabataMechanicsState,
  computeNextTabataMechanicsState,
  deriveTabataSegmentRemainingSec,
  freezeTabataMechanicsStateForPause,
  parseTabataMechanicsState,
  tabataBlockDurationSeconds,
  tabataSegmentLabel,
  unfreezeTabataMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

const CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

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
