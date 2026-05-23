import { describe, expect, it } from 'vitest';

import { applyEmomMultiExerciseAlternatingSafety } from './emom-outline-safety';

describe('applyEmomMultiExerciseAlternatingSafety', () => {
  it('defaults missing is_alternating to true and hydrates A/B matrix for 2-exercise EMOM', () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 20 },
        exercises: [{ name: 'KB Swing' }, { name: 'Band Thruster' }],
      },
    ];
    const out = applyEmomMultiExerciseAlternatingSafety(outline)!;
    const fp = out[0].format_params as Record<string, unknown>;
    expect(fp.is_alternating).toBe(true);
    expect(fp.alternating_stations).toEqual([[0], [1]]);
    expect(fp.is_combo).toBeUndefined();
  });

  it('leaves explicit is_alternating false (legacy density) unchanged', () => {
    const outline = [
      {
        name: 'Density',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 10,
          is_alternating: false,
        },
        exercises: [{ name: 'A' }, { name: 'B' }],
      },
    ];
    const out = applyEmomMultiExerciseAlternatingSafety(outline)!;
    const fp = out[0].format_params as Record<string, unknown>;
    expect(fp.is_alternating).toBe(false);
    expect(fp.alternating_stations).toBeUndefined();
  });

  it('strips is_combo when defaulting missing is_alternating', () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 20,
          is_combo: true,
        },
        exercises: [{ name: 'A' }, { name: 'B' }],
      },
    ];
    const out = applyEmomMultiExerciseAlternatingSafety(outline)!;
    const fp = out[0].format_params as Record<string, unknown>;
    expect(fp.is_alternating).toBe(true);
    expect(fp.alternating_stations).toEqual([[0], [1]]);
    expect(fp.is_combo).toBeUndefined();
  });

  it('does not mutate single-exercise EMOM blocks', () => {
    const outline = [
      {
        name: 'Straight',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 12 },
        exercises: [{ name: 'Swing' }],
      },
    ];
    const out = applyEmomMultiExerciseAlternatingSafety(outline)!;
    expect(out[0].format_params).toEqual({ interval_seconds: 60, total_minutes: 12 });
  });
});
