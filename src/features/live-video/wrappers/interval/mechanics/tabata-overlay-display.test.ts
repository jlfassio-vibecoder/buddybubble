import { describe, expect, it } from 'vitest';

import { resolveTabataOverlaySubtitle } from '@/features/live-video/wrappers/interval/mechanics/tabata-overlay-display';
import { buildInitialTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';

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
