import { describe, expect, it } from 'vitest';

import { formatBlockSubtitle } from './format-block-subtitle';

describe('formatBlockSubtitle', () => {
  it('returns null for missing, empty, straight_sets, and unknown formats', () => {
    expect(formatBlockSubtitle(null, null)).toBeNull();
    expect(formatBlockSubtitle(undefined, undefined)).toBeNull();
    expect(formatBlockSubtitle('', {})).toBeNull();
    expect(formatBlockSubtitle('straight_sets', { rounds: 4 })).toBeNull();
    expect(formatBlockSubtitle('custom_protocol', { rounds: 4 })).toBeNull();
  });

  it('formats AMRAP with and without time cap', () => {
    expect(formatBlockSubtitle('amrap', { time_cap_minutes: 12 })).toBe('12 Min AMRAP');
    expect(formatBlockSubtitle('AMRAP', {})).toBe('AMRAP');
    expect(formatBlockSubtitle('amrap', { time_cap_minutes: -1 })).toBe('AMRAP');
    expect(formatBlockSubtitle('amrap', { time_cap_minutes: NaN })).toBe('AMRAP');
  });

  it('formats EMOM with total_minutes, total_rounds, and interval', () => {
    expect(
      formatBlockSubtitle('emom', {
        interval_seconds: 60,
        total_minutes: 10,
      }),
    ).toBe('10 Min EMOM (Every 60s)');
    expect(
      formatBlockSubtitle('emom', {
        interval_seconds: 45,
        total_rounds: 8,
      }),
    ).toBe('8 Rounds EMOM (Every 45s)');
    expect(formatBlockSubtitle('emom', { total_minutes: 5 })).toBe('5 Min EMOM');
    expect(formatBlockSubtitle('emom', { interval_seconds: 60 })).toBe('EMOM (Every 60s)');
    expect(formatBlockSubtitle('emom', {})).toBe('EMOM');
  });

  it('formats Tabata bare and with full params', () => {
    expect(formatBlockSubtitle('tabata', {})).toBe('Tabata');
    expect(
      formatBlockSubtitle('tabata', {
        rounds: 8,
        work_seconds: 20,
        rest_seconds: 10,
      }),
    ).toBe('Tabata · 8 Rounds (20/10s)');
    expect(formatBlockSubtitle('tabata', { rounds: 4 })).toBe('Tabata · 4 Rounds');
    expect(
      formatBlockSubtitle('tabata', {
        rounds: 8,
        work_seconds: 0,
        rest_seconds: 10,
      }),
    ).toBe('Tabata · 8 Rounds');
  });

  it('formats superset and circuit with and without rounds', () => {
    expect(formatBlockSubtitle('superset', { rounds: 4 })).toBe('Superset · 4 Rounds');
    expect(formatBlockSubtitle('superset', {})).toBe('Superset');
    expect(formatBlockSubtitle('circuit', { rounds: 3 })).toBe('Circuit · 3 Rounds');
    expect(formatBlockSubtitle('circuit', {})).toBe('Circuit');
  });

  it('ignores non-object formatParams', () => {
    expect(formatBlockSubtitle('amrap', null)).toBe('AMRAP');
    expect(formatBlockSubtitle('amrap', [] as unknown as Record<string, unknown>)).toBe('AMRAP');
  });

  it('formats ladder ascending and descending', () => {
    expect(formatBlockSubtitle('ladder', { start_reps: 1, peak_reps: 10 })).toBe('Ladder · 1→10');
    expect(
      formatBlockSubtitle('ladder', {
        start_reps: 1,
        peak_reps: 10,
        direction: 'descending',
      }),
    ).toBe('Ladder · 10→1');
    expect(formatBlockSubtitle('ladder', {})).toBe('Ladder');
  });

  it('formats chipper with optional time cap', () => {
    expect(formatBlockSubtitle('chipper', { rounds: 1 })).toBe('Chipper');
    expect(formatBlockSubtitle('chipper', { rounds: 1, time_cap_minutes: 12 })).toBe(
      'Chipper · 12 Min',
    );
  });

  it('formats pyramid ascending and descending', () => {
    expect(formatBlockSubtitle('pyramid', { start_reps: 6, peak_reps: 12 })).toBe('Pyramid · 6→12');
    expect(
      formatBlockSubtitle('pyramid', {
        start_reps: 6,
        peak_reps: 12,
        direction: 'descending',
      }),
    ).toBe('Pyramid · 12→6');
  });

  it('formats contrast clusters and drop_sets', () => {
    expect(formatBlockSubtitle('contrast', { rounds: 4 })).toBe('Contrast · 4 Rounds');
    expect(formatBlockSubtitle('clusters', { reps_per_cluster: 3, clusters: 4 })).toBe(
      'Clusters · 4×3',
    );
    expect(formatBlockSubtitle('drop_sets', { drop_percent: 20, drops: 2 })).toBe(
      'Drop sets · 20% × 2',
    );
  });
});
