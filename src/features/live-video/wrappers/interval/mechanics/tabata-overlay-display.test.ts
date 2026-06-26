import { describe, expect, it } from 'vitest';

import {
  resolveTabataOverlayHeader,
  resolveTabataOverlaySubtitle,
  tabataOverlayAudioIsActive,
  tabataOverlayCueSegmentKey,
  tabataOverlayShowProgress,
  tabataSegmentPhaseAccentClass,
  tabataSegmentProgressFillClass,
  tabataSegmentProgressRatio,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-overlay-display';
import { buildInitialTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

const CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

describe('resolveTabataOverlayHeader', () => {
  it('falls back to Tabata when format_params is missing', () => {
    expect(resolveTabataOverlayHeader(undefined)).toBe('Tabata');
    expect(resolveTabataOverlayHeader({})).toBe('Tabata');
  });

  it('resolves preset label when format_params are present', () => {
    expect(
      resolveTabataOverlayHeader({
        rounds: 8,
        work_seconds: 30,
        rest_seconds: 30,
        interval_preset: 'classic_hiit',
      }),
    ).toBe('Classic HIIT');
  });
});

describe('resolveTabataOverlaySubtitle', () => {
  it('returns null during setup', () => {
    const mechanics = buildInitialTabataMechanicsState({
      totalRounds: 12,
      workSeconds: 30,
      restSeconds: 30,
    });
    expect(
      resolveTabataOverlaySubtitle({
        mechanics,
        exercises: [{ name: 'A', sets: 3 }],
        formatParams: { rounds: 3, work_seconds: 30, rest_seconds: 30 },
      }),
    ).toBeNull();
  });

  it('returns dynamic circuit subtitle during work', () => {
    const mechanics = {
      ...buildInitialTabataMechanicsState({ totalRounds: 12, workSeconds: 30, restSeconds: 30 }),
      segment: 'work' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(
      resolveTabataOverlaySubtitle({
        mechanics,
        exercises: [
          { name: 'Burpees', sets: 3 },
          { name: 'Mountain Climbers', sets: 3 },
        ],
        formatParams: { rounds: 3, work_seconds: 30, rest_seconds: 30 },
      }),
    ).toBe('Round 2 of 12 · Mountain Climbers');
  });

  it('returns static subtitle for single exercise', () => {
    const mechanics = {
      ...buildInitialTabataMechanicsState({ totalRounds: 8, workSeconds: 30, restSeconds: 30 }),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(
      resolveTabataOverlaySubtitle({
        mechanics,
        exercises: [{ name: 'Squat', sets: 8 }],
        formatParams: { rounds: 8, work_seconds: 30, rest_seconds: 30 },
      }),
    ).toBe('8 Rounds (30/30s)');
  });
});

describe('tabataSegmentPhaseAccentClass', () => {
  it('returns segment-specific accent classes', () => {
    expect(tabataSegmentPhaseAccentClass('work')).toBe('text-emerald-300');
    expect(tabataSegmentPhaseAccentClass('rest')).toBe('text-amber-300');
    expect(tabataSegmentPhaseAccentClass('setup')).toBe('text-sky-300');
    expect(tabataSegmentPhaseAccentClass('idle')).toBe('text-white/40');
  });

  it('returns paused styling', () => {
    expect(tabataSegmentPhaseAccentClass('work', { isPaused: true })).toBe('text-white/50');
  });
});

describe('tabataSegmentProgressRatio', () => {
  it('computes elapsed ratio within segment', () => {
    expect(tabataSegmentProgressRatio(10, 20)).toBe(0.5);
    expect(tabataSegmentProgressRatio(7, 20)).toBeCloseTo(0.65);
  });

  it('returns 0 when totalSec is invalid', () => {
    expect(tabataSegmentProgressRatio(10, 0)).toBe(0);
  });
});

describe('tabataOverlayCueSegmentKey', () => {
  it('builds stable key from segment anchor', () => {
    const state = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 2,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(tabataOverlayCueSegmentKey(state)).toBe('work-2-2026-06-01T18:30:12.000Z');
  });
});

describe('tabataOverlayAudioIsActive', () => {
  it('is active during anchored work segment', () => {
    const state = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(tabataOverlayAudioIsActive({ timerPhase: 'work' }, state)).toBe(true);
  });

  it('is inactive when paused or on rest-only without work phase', () => {
    const paused = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
      is_paused: true as const,
    };
    expect(tabataOverlayAudioIsActive({ timerPhase: 'work' }, paused)).toBe(false);

    const rest = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'rest' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:32.000Z',
    };
    expect(tabataOverlayAudioIsActive({ timerPhase: 'work' }, rest)).toBe(true);
    expect(tabataOverlayAudioIsActive({ timerPhase: 'idle' }, rest)).toBe(false);
  });
});

describe('tabataOverlayShowProgress', () => {
  it('hides for finished and idle segments', () => {
    const idle = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'idle' as const,
    };
    expect(tabataOverlayShowProgress({ timerPhase: 'work', totalSec: 20 }, idle)).toBe(false);

    const work = {
      ...buildInitialTabataMechanicsState(CONFIG),
      segment: 'work' as const,
      round_index: 1,
      segment_started_at: '2026-06-01T18:30:12.000Z',
    };
    expect(tabataOverlayShowProgress({ timerPhase: 'work', totalSec: 20 }, work)).toBe(true);
    expect(tabataOverlayShowProgress({ timerPhase: 'finished', totalSec: 20 }, work)).toBe(false);
  });
});

describe('tabataSegmentProgressFillClass', () => {
  it('matches segment accent colors', () => {
    expect(tabataSegmentProgressFillClass('work')).toBe('bg-emerald-400');
    expect(tabataSegmentProgressFillClass('rest')).toBe('bg-amber-400');
  });
});
