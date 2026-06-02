import { describe, expect, it } from 'vitest';

import {
  EMOM_DEFAULT_SETUP_SECONDS,
  beginEmomSegmentTimer,
  buildInitialEmomMechanicsState,
  computeNextEmomMechanicsState,
  deriveEmomSegmentRemainingSec,
  emomBlockDurationSeconds,
  freezeEmomMechanicsStateForPause,
  parseEmomMechanicsState,
  unfreezeEmomMechanicsStateForResume,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';

const CONFIG = { totalMinutes: 16, intervalSeconds: 60 };

describe('parseEmomMechanicsState', () => {
  it('parses valid state', () => {
    const parsed = parseEmomMechanicsState({
      segment: 'minute',
      minute_index: 3,
      total_minutes: 16,
      interval_seconds: 60,
      setup_seconds: 10,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    });
    expect(parsed?.minute_index).toBe(3);
    expect(parsed?.segment).toBe('minute');
  });

  it('returns null for invalid segment', () => {
    expect(parseEmomMechanicsState({ segment: 'work' })).toBeNull();
  });
});

describe('buildInitialEmomMechanicsState', () => {
  it('starts in setup with 10s and no anchor', () => {
    const state = buildInitialEmomMechanicsState(CONFIG);
    expect(state.segment).toBe('setup');
    expect(state.setup_seconds).toBe(EMOM_DEFAULT_SETUP_SECONDS);
    expect(state.segment_started_at).toBeNull();
    expect(state.minute_index).toBe(0);
  });
});

describe('emomBlockDurationSeconds', () => {
  it('matches setup + minutes * interval', () => {
    const state = buildInitialEmomMechanicsState(CONFIG);
    expect(emomBlockDurationSeconds(state)).toBe(10 + 16 * 60);
  });
});

describe('beginEmomSegmentTimer', () => {
  it('starts setup countdown without entering minute', () => {
    const attached = buildInitialEmomMechanicsState(CONFIG);
    const started = beginEmomSegmentTimer(attached, Date.parse('2026-06-01T18:30:00.000Z'));
    expect(started.segment).toBe('setup');
    expect(started.minute_index).toBe(0);
    expect(started.segment_started_at).not.toBeNull();
  });
});

describe('computeNextEmomMechanicsState', () => {
  it('setup advances to minute 1', () => {
    const setup = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextEmomMechanicsState(setup, Date.parse('2026-06-01T18:30:10.000Z'));
    expect(next.segment).toBe('minute');
    expect(next.minute_index).toBe(1);
  });

  it('minute 16 advances to done', () => {
    const minute = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 16,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const next = computeNextEmomMechanicsState(minute, Date.parse('2026-06-01T18:31:00.000Z'));
    expect(next.segment).toBe('done');
  });
});

describe('polymorphic pause', () => {
  it('freezes remaining at pause moment', () => {
    const minute = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    const pauseAt = Date.parse('2026-06-01T18:30:08.000Z');
    const frozen = freezeEmomMechanicsStateForPause(minute, pauseAt);
    expect(frozen.is_paused).toBe(true);
    expect(deriveEmomSegmentRemainingSec(frozen, pauseAt)).toBe(52);
  });

  it('resumes from frozen elapsed', () => {
    const frozen = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:00.000Z',
      is_paused: true,
      elapsed_in_segment: 8,
    };
    const resumeAt = Date.parse('2026-06-01T18:30:20.000Z');
    const resumed = unfreezeEmomMechanicsStateForResume(frozen, resumeAt);
    expect(resumed.is_paused).toBeUndefined();
    expect(deriveEmomSegmentRemainingSec(resumed, resumeAt)).toBe(52);
  });
});
