import { describe, expect, it } from 'vitest';

import {
  INTERVAL_PRESET_CATALOG,
  INTERVAL_PRESET_IDS,
  INTERVAL_PRESET_ROUND_BOUNDS,
  applyIntervalPreset,
  computeRestFromWorkAndRatio,
  deriveIntervalPresetFromParams,
  getIntervalPresetDefinition,
  isIntervalPresetId,
  isRoundCountValidForPreset,
  mergeTabataFormatParams,
  paramsMatchPreset,
  reconcileIntervalPreset,
  resolveIntervalPresetLabel,
  resolveRatioForTabataParams,
} from './interval-preset-catalog';

describe('INTERVAL_PRESET_CATALOG', () => {
  it('defines six industry presets', () => {
    expect(INTERVAL_PRESET_IDS).toHaveLength(6);
    expect(INTERVAL_PRESET_CATALOG.map((p) => p.id)).toEqual([...INTERVAL_PRESET_IDS]);
  });
});

describe('applyIntervalPreset', () => {
  it.each(INTERVAL_PRESET_IDS)('returns canonical params for %s', (id) => {
    const preset = getIntervalPresetDefinition(id);
    expect(applyIntervalPreset(id)).toEqual({
      work_seconds: preset.workSeconds,
      rest_seconds: preset.restSeconds,
      rounds: preset.defaultRounds,
      interval_preset: id,
    });
  });

  it('allows round overrides', () => {
    expect(applyIntervalPreset('classic_hiit', { rounds: 10 }).rounds).toBe(10);
  });
});

describe('deriveIntervalPresetFromParams', () => {
  it.each(INTERVAL_PRESET_IDS)('recognizes canonical %s params', (id) => {
    const params = applyIntervalPreset(id);
    expect(deriveIntervalPresetFromParams(params)).toBe(id);
  });

  it('returns custom when work/rest diverge from any preset', () => {
    expect(
      deriveIntervalPresetFromParams({
        rounds: 8,
        work_seconds: 25,
        rest_seconds: 30,
        interval_preset: 'classic_hiit',
      }),
    ).toBe('custom');
  });
});

describe('computeRestFromWorkAndRatio', () => {
  it('computes rest for each ratio', () => {
    expect(computeRestFromWorkAndRatio(30, '1:1')).toBe(30);
    expect(computeRestFromWorkAndRatio(40, '2:1')).toBe(20);
    expect(computeRestFromWorkAndRatio(20, '1:2')).toBe(40);
    expect(computeRestFromWorkAndRatio(10, '1:3')).toBe(30);
    expect(computeRestFromWorkAndRatio(10, '1:5')).toBe(50);
    expect(computeRestFromWorkAndRatio(300, '5:1')).toBe(60);
  });

  it('rounds fractional rest for 2:1 and 5:1', () => {
    expect(computeRestFromWorkAndRatio(45, '2:1')).toBe(23);
    expect(computeRestFromWorkAndRatio(47, '5:1')).toBe(9);
  });

  it('returns 0 for invalid work', () => {
    expect(computeRestFromWorkAndRatio(0, '1:1')).toBe(0);
    expect(computeRestFromWorkAndRatio(-5, '1:1')).toBe(0);
  });
});

describe('paramsMatchPreset', () => {
  it('matches work and rest only by default', () => {
    expect(
      paramsMatchPreset({ work_seconds: 30, rest_seconds: 30, rounds: 4 }, 'classic_hiit'),
    ).toBe(true);
    expect(
      paramsMatchPreset({ work_seconds: 30, rest_seconds: 30, rounds: 4 }, 'classic_hiit', {
        requireRounds: true,
      }),
    ).toBe(false);
  });
});

describe('resolveIntervalPresetLabel', () => {
  it('uses preset label when id and W/R match', () => {
    expect(
      resolveIntervalPresetLabel({
        interval_preset: 'classic_hiit',
        rounds: 8,
        work_seconds: 30,
        rest_seconds: 30,
      }),
    ).toBe('Classic HIIT');
  });

  it('falls back to Intervals when preset id diverges from W/R', () => {
    expect(
      resolveIntervalPresetLabel({
        interval_preset: 'classic_hiit',
        rounds: 8,
        work_seconds: 25,
        rest_seconds: 30,
      }),
    ).toBe('Intervals');
  });

  it('uses Tabata label for legacy 20/10 without interval_preset', () => {
    expect(
      resolveIntervalPresetLabel({
        rounds: 8,
        work_seconds: 20,
        rest_seconds: 10,
      }),
    ).toBe('Tabata');
  });
});

describe('reconcileIntervalPreset', () => {
  it('derives classic_hiit from 30/30 without interval_preset', () => {
    expect(
      reconcileIntervalPreset({
        rounds: 12,
        work_seconds: 30,
        rest_seconds: 30,
      }),
    ).toEqual({
      rounds: 12,
      work_seconds: 30,
      rest_seconds: 30,
      interval_preset: 'classic_hiit',
    });
  });

  it('re-derives when explicit preset disagrees with W/R', () => {
    expect(
      reconcileIntervalPreset({
        rounds: 8,
        work_seconds: 30,
        rest_seconds: 30,
        interval_preset: 'tabata',
      }),
    ).toEqual({
      rounds: 8,
      work_seconds: 30,
      rest_seconds: 30,
      interval_preset: 'classic_hiit',
    });
  });

  it('preserves custom when W/R match no catalog preset', () => {
    expect(
      reconcileIntervalPreset({
        rounds: 8,
        work_seconds: 25,
        rest_seconds: 30,
        interval_preset: 'classic_hiit',
      }),
    ).toEqual({
      rounds: 8,
      work_seconds: 25,
      rest_seconds: 30,
      interval_preset: 'custom',
    });
  });
});

describe('INTERVAL_PRESET_ROUND_BOUNDS', () => {
  it('validates round counts per preset', () => {
    expect(isRoundCountValidForPreset(8, 'tabata')).toBe(true);
    expect(isRoundCountValidForPreset(3, 'tabata')).toBe(false);
    expect(isRoundCountValidForPreset(16, 'classic_hiit')).toBe(true);
    expect(INTERVAL_PRESET_ROUND_BOUNDS.custom.max).toBe(20);
  });
});

describe('isIntervalPresetId', () => {
  it('accepts known ids and rejects custom/unknown', () => {
    expect(isIntervalPresetId('tabata')).toBe(true);
    expect(isIntervalPresetId('custom')).toBe(false);
    expect(isIntervalPresetId('unknown')).toBe(false);
  });
});

describe('mergeTabataFormatParams', () => {
  it('recalculates rest when work changes with locked rest and ratio', () => {
    const result = mergeTabataFormatParams(
      applyIntervalPreset('classic_hiit'),
      { work_seconds: 45 },
      { restLocked: true, ratio: '1:1' },
    );
    expect(result.work_seconds).toBe(45);
    expect(result.rest_seconds).toBe(45);
    expect(result.interval_preset).toBe('custom');
  });

  it('marks custom when rest is edited manually', () => {
    const result = mergeTabataFormatParams(
      applyIntervalPreset('classic_hiit'),
      { rest_seconds: 25 },
      { manualRestEdit: true },
    );
    expect(result.rest_seconds).toBe(25);
    expect(result.interval_preset).toBe('custom');
  });

  it('re-derives preset id when W/R match a catalog preset', () => {
    const result = mergeTabataFormatParams(
      { rounds: 8, work_seconds: 25, rest_seconds: 25, interval_preset: 'custom' },
      { work_seconds: 30, rest_seconds: 30 },
      { restLocked: false },
    );
    expect(result.interval_preset).toBe('classic_hiit');
  });

  it('resolveRatioForTabataParams uses stored preset ratio', () => {
    expect(resolveRatioForTabataParams(applyIntervalPreset('power_sprints'))).toBe('1:5');
  });
});
