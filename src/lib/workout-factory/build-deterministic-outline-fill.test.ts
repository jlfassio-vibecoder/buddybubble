import { describe, expect, it } from 'vitest';
import {
  buildDeterministicOutlineFillFromPreflight,
  defaultSetsForFormat,
} from '@/lib/workout-factory/build-deterministic-outline-fill';

describe('defaultSetsForFormat', () => {
  it('uses 3 sets for straight_sets and drop_sets', () => {
    expect(defaultSetsForFormat('straight_sets')).toBe(3);
    expect(defaultSetsForFormat('drop_sets')).toBe(3);
  });

  it('uses 1 set for other formats', () => {
    expect(defaultSetsForFormat('circuit')).toBe(1);
    expect(defaultSetsForFormat('emom')).toBe(1);
  });
});

describe('buildDeterministicOutlineFillFromPreflight', () => {
  it('preserves EMOM name-only exercises when format_params carry timing', () => {
    const preflight = [
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 16,
          is_alternating: true,
        },
        exercises: [{ name: 'Swing' }, { name: 'Squat' }],
      },
    ];
    const out = buildDeterministicOutlineFillFromPreflight(preflight);
    expect(out[0]?.exercises).toEqual([{ name: 'Swing' }, { name: 'Squat' }]);
    expect((out[0]?.format_params as Record<string, unknown>)?.interval_seconds).toBe(60);
  });

  it('applies straight_sets default sets and reps', () => {
    const preflight = [
      {
        name: 'Main Strength',
        block_format: 'straight_sets',
        format_params: { rest_between_sets_seconds: 90 },
        exercises: [{ name: 'Back Squat' }],
      },
    ];
    const out = buildDeterministicOutlineFillFromPreflight(preflight);
    expect(out[0]?.exercises).toEqual([{ name: 'Back Squat', sets: 3, reps: '8-12' }]);
  });

  it('applies circuit defaults per station', () => {
    const preflight = [
      {
        name: 'Main Circuit',
        block_format: 'circuit',
        format_params: { rounds: 3 },
        exercises: [{ name: 'Push-up' }, { name: 'Squat' }, { name: 'Row' }],
      },
    ];
    const out = buildDeterministicOutlineFillFromPreflight(preflight);
    expect(out[0]?.exercises).toEqual([
      { name: 'Push-up', sets: 1, reps: '10' },
      { name: 'Squat', sets: 1, reps: '10' },
      { name: 'Row', sets: 1, reps: '10' },
    ]);
  });

  it('copies instruction-only warm-up unchanged', () => {
    const preflight = [{ name: 'Warm-up', instructions: ['5 min bike', 'Dynamic prep'] }];
    const out = buildDeterministicOutlineFillFromPreflight(preflight);
    expect(out[0]).toEqual({
      name: 'Warm-up',
      instructions: ['5 min bike', 'Dynamic prep'],
    });
  });

  it('strips whitespace-only instruction lines in instruction-only blocks', () => {
    const preflight = [{ name: 'Warm-up', instructions: ['5 min bike', '   ', 'Dynamic prep'] }];
    const out = buildDeterministicOutlineFillFromPreflight(preflight);
    expect(out[0]).toEqual({
      name: 'Warm-up',
      instructions: ['5 min bike', 'Dynamic prep'],
    });
  });

  it('preserves Tabata name-only when rounds are in format_params', () => {
    const preflight = [
      {
        name: 'Finisher Tabata',
        block_format: 'tabata',
        format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
        exercises: [{ name: 'Burpee' }],
      },
    ];
    const out = buildDeterministicOutlineFillFromPreflight(preflight);
    expect(out[0]?.exercises).toEqual([{ name: 'Burpee' }]);
    expect((out[0]?.format_params as Record<string, unknown>)?.rounds).toBe(8);
  });
});
