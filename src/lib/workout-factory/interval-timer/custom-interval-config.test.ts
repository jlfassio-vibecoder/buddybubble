import { describe, expect, it } from 'vitest';

import {
  CUSTOM_INTERVAL_REST_SECONDS_BOUNDS,
  CUSTOM_INTERVAL_STATION_BOUNDS,
  CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS,
  DEFAULT_CUSTOM_INTERVAL_CONFIG,
  parseCustomIntervalActiveRestNames,
  parseCustomIntervalStationNames,
  previewCustomIntervalDuration,
  validateCustomIntervalConfig,
} from './custom-interval-config';

describe('validateCustomIntervalConfig', () => {
  it('accepts valid config and forces interval_preset custom', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        interval_preset: 'custom',
      },
    });
  });

  it('accepts rest_seconds 0', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 45,
      rest_seconds: 0,
      rounds: 6,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rest_seconds).toBe(0);
      expect(result.value.interval_preset).toBe('custom');
    }
  });

  it('rounds finite non-integers', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 30.4,
      rest_seconds: 29.6,
      rounds: 7.2,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        work_seconds: 30,
        rest_seconds: 30,
        rounds: 7,
        interval_preset: 'custom',
      },
    });
  });

  it('accepts default seed config', () => {
    const result = validateCustomIntervalConfig(DEFAULT_CUSTOM_INTERVAL_CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject(DEFAULT_CUSTOM_INTERVAL_CONFIG);
      expect(result.value.interval_preset).toBe('custom');
    }
  });

  it('rejects work_seconds 0 and above max', () => {
    expect(validateCustomIntervalConfig({ work_seconds: 0, rest_seconds: 10, rounds: 8 }).ok).toBe(
      false,
    );
    expect(
      validateCustomIntervalConfig({
        work_seconds: CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.max + 1,
        rest_seconds: 10,
        rounds: 8,
      }).ok,
    ).toBe(false);
  });

  it('rejects rest_seconds below min and above max', () => {
    expect(validateCustomIntervalConfig({ work_seconds: 20, rest_seconds: -1, rounds: 8 }).ok).toBe(
      false,
    );
    // Fractional negatives must not round to 0 and pass the min bound.
    expect(
      validateCustomIntervalConfig({ work_seconds: 20, rest_seconds: -0.4, rounds: 8 }).ok,
    ).toBe(false);
    expect(
      validateCustomIntervalConfig({
        work_seconds: 20,
        rest_seconds: CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.max + 1,
        rounds: 8,
      }).ok,
    ).toBe(false);
  });

  it('rejects rounds outside custom bounds', () => {
    expect(validateCustomIntervalConfig({ work_seconds: 20, rest_seconds: 10, rounds: 0 }).ok).toBe(
      false,
    );
    expect(
      validateCustomIntervalConfig({ work_seconds: 20, rest_seconds: 10, rounds: 21 }).ok,
    ).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateCustomIntervalConfig(null).ok).toBe(false);
    expect(validateCustomIntervalConfig(undefined).ok).toBe(false);
    expect(validateCustomIntervalConfig(42).ok).toBe(false);
  });

  it('keeps custom preset even when W/R match a named preset', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 30,
      rest_seconds: 30,
      rounds: 8,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.interval_preset).toBe('custom');
    }
  });

  it('accepts optional station_names', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 30,
      rest_seconds: 30,
      rounds: 3,
      station_names: ['Burpees', 'Mountain Climbers'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.station_names).toEqual(['Burpees', 'Mountain Climbers']);
    }
  });

  it('rejects too many station_names', () => {
    const names = Array.from(
      { length: CUSTOM_INTERVAL_STATION_BOUNDS.maxCount + 1 },
      (_, i) => `S${i}`,
    );
    expect(
      validateCustomIntervalConfig({
        work_seconds: 30,
        rest_seconds: 30,
        rounds: 3,
        station_names: names,
      }).ok,
    ).toBe(false);
  });

  it('omits empty station_names array', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 30,
      rest_seconds: 30,
      rounds: 3,
      station_names: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.station_names).toBeUndefined();
    }
  });

  it('accepts rest_mode active with names and rest_seconds > 0', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
      rest_mode: 'active',
      active_rest_exercises: ['Jogging'],
    });
    expect(result).toEqual({
      ok: true,
      value: {
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        interval_preset: 'custom',
        rest_mode: 'active',
        active_rest_exercises: ['Jogging'],
      },
    });
  });

  it('rejects rest_mode active when rest_seconds is 0', () => {
    expect(
      validateCustomIntervalConfig({
        work_seconds: 30,
        rest_seconds: 0,
        rounds: 6,
        rest_mode: 'active',
        active_rest_exercises: ['Jogging'],
      }).ok,
    ).toBe(false);
  });

  it('rejects rest_mode active without active_rest_exercises', () => {
    expect(
      validateCustomIntervalConfig({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        rest_mode: 'active',
      }).ok,
    ).toBe(false);
  });

  it('rejects active_rest_exercises when rest_mode is not active', () => {
    expect(
      validateCustomIntervalConfig({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        active_rest_exercises: ['Jogging'],
      }).ok,
    ).toBe(false);
    expect(
      validateCustomIntervalConfig({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        rest_mode: 'passive',
        active_rest_exercises: ['Jogging'],
      }).ok,
    ).toBe(false);
  });

  it('strips rest_mode passive from normalized output', () => {
    const result = validateCustomIntervalConfig({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
      rest_mode: 'passive',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rest_mode).toBeUndefined();
      expect(result.value.active_rest_exercises).toBeUndefined();
    }
  });

  it('rejects invalid rest_mode', () => {
    expect(
      validateCustomIntervalConfig({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        rest_mode: 'recovery',
      }).ok,
    ).toBe(false);
  });
});

describe('parseCustomIntervalStationNames', () => {
  it('splits on commas and newlines and trims', () => {
    expect(parseCustomIntervalStationNames('Burpees, Mountain Climbers\nSquats')).toEqual([
      'Burpees',
      'Mountain Climbers',
      'Squats',
    ]);
  });

  it('drops empties and caps count', () => {
    const raw = Array.from({ length: 15 }, (_, i) => `Station ${i + 1}`).join(', ');
    const parsed = parseCustomIntervalStationNames(raw);
    expect(parsed).toHaveLength(CUSTOM_INTERVAL_STATION_BOUNDS.maxCount);
    expect(parsed[0]).toBe('Station 1');
  });

  it('returns empty for blank input', () => {
    expect(parseCustomIntervalStationNames('')).toEqual([]);
    expect(parseCustomIntervalStationNames('  , \n ')).toEqual([]);
  });

  it('parseCustomIntervalActiveRestNames aliases station parser', () => {
    expect(parseCustomIntervalActiveRestNames).toBe(parseCustomIntervalStationNames);
    expect(parseCustomIntervalActiveRestNames('Jogging, March')).toEqual(['Jogging', 'March']);
  });
});

describe('previewCustomIntervalDuration', () => {
  it('returns live duration including default setup', () => {
    expect(previewCustomIntervalDuration({ work_seconds: 20, rest_seconds: 10, rounds: 8 })).toBe(
      10 + 8 * 20 + 7 * 10,
    );
  });

  it('returns null for invalid config', () => {
    expect(
      previewCustomIntervalDuration({ work_seconds: 0, rest_seconds: 10, rounds: 8 }),
    ).toBeNull();
  });

  it('computes zero-rest protocols', () => {
    expect(previewCustomIntervalDuration({ work_seconds: 20, rest_seconds: 0, rounds: 8 })).toBe(
      10 + 8 * 20,
    );
  });

  it('multiplies work segments for multi-station circuits', () => {
    expect(
      previewCustomIntervalDuration({
        work_seconds: 30,
        rest_seconds: 30,
        rounds: 3,
        station_names: ['A', 'B', 'C', 'D'],
      }),
    ).toBe(10 + 12 * 30 + 11 * 30);
  });

  it('still previews duration when active rest is configured', () => {
    expect(
      previewCustomIntervalDuration({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        rest_mode: 'active',
        active_rest_exercises: ['Jogging'],
      }),
    ).toBe(10 + 6 * 45 + 5 * 15);
  });
});
