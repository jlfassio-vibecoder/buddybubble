import { describe, expect, it } from 'vitest';

import { buildInitialEmomMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import {
  emomOverlayAudioIsActive,
  emomOverlayCueSegmentKey,
  emomOverlayShowProgress,
  emomSegmentPhaseAccentClass,
  emomSegmentProgressFillClass,
  emomSegmentProgressRatio,
} from '@/features/live-video/wrappers/interval/mechanics/emom-overlay-display';

const CONFIG = { totalMinutes: 12, intervalSeconds: 60 };

describe('emomSegmentPhaseAccentClass', () => {
  it('returns segment-specific accent classes', () => {
    expect(emomSegmentPhaseAccentClass('minute')).toBe('text-emerald-300');
    expect(emomSegmentPhaseAccentClass('setup')).toBe('text-sky-300');
    expect(emomSegmentPhaseAccentClass('idle')).toBe('text-white/40');
  });

  it('returns paused styling', () => {
    expect(emomSegmentPhaseAccentClass('minute', { isPaused: true })).toBe('text-white/50');
  });
});

describe('emomSegmentProgressRatio', () => {
  it('computes elapsed ratio within segment', () => {
    expect(emomSegmentProgressRatio(30, 60)).toBe(0.5);
    expect(emomSegmentProgressRatio(15, 60)).toBeCloseTo(0.75);
  });

  it('returns 0 when totalSec is invalid', () => {
    expect(emomSegmentProgressRatio(10, 0)).toBe(0);
  });
});

describe('emomOverlayCueSegmentKey', () => {
  it('builds stable key from segment anchor', () => {
    const state = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 3,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(emomOverlayCueSegmentKey(state)).toBe('minute-3-2026-06-01T18:30:12.000Z');
  });
});

describe('emomOverlayAudioIsActive', () => {
  it('is active during anchored minute segment', () => {
    const state = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(emomOverlayAudioIsActive({ timerPhase: 'work' }, state)).toBe(true);
  });

  it('is inactive when paused or timer not in work phase', () => {
    const paused = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
      is_paused: true as const,
    };
    expect(emomOverlayAudioIsActive({ timerPhase: 'work' }, paused)).toBe(false);

    const setup = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'setup' as const,
      minute_index: 0,
      segment_started_at: '2026-06-01T18:30:00.000Z',
    };
    expect(emomOverlayAudioIsActive({ timerPhase: 'work' }, setup)).toBe(true);
    expect(emomOverlayAudioIsActive({ timerPhase: 'idle' }, setup)).toBe(false);
  });
});

describe('emomOverlayShowProgress', () => {
  it('hides for finished and idle segments', () => {
    const idle = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'idle' as const,
    };
    expect(emomOverlayShowProgress({ timerPhase: 'work', totalSec: 60 }, idle)).toBe(false);

    const minute = {
      ...buildInitialEmomMechanicsState(CONFIG),
      segment: 'minute' as const,
      minute_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(emomOverlayShowProgress({ timerPhase: 'work', totalSec: 60 }, minute)).toBe(true);
    expect(emomOverlayShowProgress({ timerPhase: 'finished', totalSec: 60 }, minute)).toBe(false);
  });
});

describe('emomSegmentProgressFillClass', () => {
  it('matches segment accent colors', () => {
    expect(emomSegmentProgressFillClass('minute')).toBe('bg-emerald-400');
    expect(emomSegmentProgressFillClass('setup')).toBe('bg-sky-400');
  });
});
