import { describe, expect, it } from 'vitest';

import {
  BLOCK_BLUEPRINT_LIBRARY_HEADER,
  BLOCK_FORMAT_ENUM,
  buildBlockBlueprintLibraryPrompt,
  buildComboAlternatingStationsMatrix,
  buildDefaultAlternatingStationsMatrix,
  hydrateEmomAlternatingStations,
  mapLegacyTypeToBlockFormat,
  normalizeFormatParams,
  shouldInjectBlockBlueprintLibrary,
  userMessageShowsDraftIntent,
  validateBlockShape,
} from './block-blueprint-library';

describe('mapLegacyTypeToBlockFormat', () => {
  it('maps AMRAP and emom case-insensitively', () => {
    expect(mapLegacyTypeToBlockFormat('AMRAP')).toBe('amrap');
    expect(mapLegacyTypeToBlockFormat('  emom  ')).toBe('emom');
  });

  it('maps Phase C formats and drop-set aliases', () => {
    expect(mapLegacyTypeToBlockFormat('pyramid')).toBe('pyramid');
    expect(mapLegacyTypeToBlockFormat('contrast')).toBe('contrast');
    expect(mapLegacyTypeToBlockFormat('clusters')).toBe('clusters');
    expect(mapLegacyTypeToBlockFormat('drop-set')).toBe('drop_sets');
    expect(mapLegacyTypeToBlockFormat('drop_set')).toBe('drop_sets');
  });

  it('returns null for unknown or non-string', () => {
    expect(mapLegacyTypeToBlockFormat('unknown')).toBeNull();
    expect(mapLegacyTypeToBlockFormat(42)).toBeNull();
  });
});

describe('normalizeFormatParams', () => {
  it('rounds floats and drops irrelevant keys for tabata', () => {
    const out = normalizeFormatParams('tabata', {
      rounds: 8.2,
      work_seconds: 20,
      rest_seconds: 10,
      time_cap_minutes: 12,
    });
    expect(out).toEqual({ rounds: 8, work_seconds: 20, rest_seconds: 10 });
    expect(out).not.toHaveProperty('time_cap_minutes');
  });

  it('normalizes ladder direction and rep params', () => {
    const out = normalizeFormatParams('ladder', {
      start_reps: 1,
      peak_reps: 10,
      step_reps: 2,
      direction: 'Descending',
      rounds: 1,
    });
    expect(out).toEqual({
      start_reps: 1,
      peak_reps: 10,
      step_reps: 2,
      direction: 'descending',
      rounds: 1,
    });
  });

  it('normalizes chipper rounds and optional time cap', () => {
    const out = normalizeFormatParams('chipper', {
      rounds: 1,
      time_cap_minutes: 15,
      interval_seconds: 60,
    });
    expect(out).toEqual({ rounds: 1, time_cap_minutes: 15 });
  });

  it('drops non-finite values', () => {
    const out = normalizeFormatParams('amrap', {
      time_cap_minutes: Number.NaN,
    });
    expect(out).toEqual({});
  });

  it('normalizes pyramid direction and load progression', () => {
    const out = normalizeFormatParams('pyramid', {
      start_reps: 6,
      peak_reps: 12,
      direction: 'Ascending',
      load_progression_percent: 5,
    });
    expect(out).toEqual({
      start_reps: 6,
      peak_reps: 12,
      direction: 'ascending',
      load_progression_percent: 5,
    });
  });

  it('normalizes clusters and drop_sets params', () => {
    expect(
      normalizeFormatParams('clusters', {
        reps_per_cluster: 3,
        clusters: 4,
        intra_cluster_rest_seconds: 15,
      }),
    ).toEqual({ reps_per_cluster: 3, clusters: 4, intra_cluster_rest_seconds: 15 });
    expect(normalizeFormatParams('drop_sets', { drop_percent: 20, drops: 2 })).toEqual({
      drop_percent: 20,
      drops: 2,
    });
  });

  it('preserves rich EMOM stations and track_active_pacing', () => {
    expect(
      normalizeFormatParams('emom', {
        interval_seconds: 60,
        total_minutes: 12,
        track_active_pacing: false,
        stations: [
          { is_rest: false, exercise_index: 0, target_type: 'reps', target_value: 10 },
          { is_rest: true },
        ],
      }),
    ).toEqual({
      interval_seconds: 60,
      total_minutes: 12,
      track_active_pacing: false,
      stations: [
        { is_rest: false, exercise_index: 0, target_type: 'reps', target_value: 10 },
        { is_rest: true },
      ],
    });
  });

  it('defaults interval_seconds when EMOM duration is present', () => {
    expect(normalizeFormatParams('emom', { total_minutes: 20 })).toEqual({
      interval_seconds: 60,
      total_minutes: 20,
    });
    expect(normalizeFormatParams('emom', { total_rounds: 8 })).toEqual({
      interval_seconds: 60,
      total_rounds: 8,
    });
    expect(normalizeFormatParams('emom', { interval_seconds: 60 })).toEqual({
      interval_seconds: 60,
    });
    expect(normalizeFormatParams('emom', {})).toEqual({});
  });

  it('normalizes alternating EMOM params and strips stations when not alternating', () => {
    expect(
      normalizeFormatParams('emom', {
        interval_seconds: 60,
        total_minutes: 12,
      }),
    ).toEqual({ interval_seconds: 60, total_minutes: 12 });

    expect(
      normalizeFormatParams('emom', {
        interval_seconds: 60,
        total_minutes: 12,
        is_alternating: true,
        alternating_stations: [[0], [1, 2]],
      }),
    ).toEqual({
      interval_seconds: 60,
      total_minutes: 12,
      is_alternating: true,
      alternating_stations: [[0], [1, 2]],
    });

    expect(
      normalizeFormatParams('emom', {
        interval_seconds: 60,
        total_minutes: 12,
        is_alternating: false,
        alternating_stations: [[0]],
      }),
    ).toEqual({ interval_seconds: 60, total_minutes: 12, is_alternating: false });

    expect(
      normalizeFormatParams('emom', {
        interval_seconds: 60,
        total_minutes: 12,
        is_alternating: true,
        alternating_stations: [[0], [1.9, 2]],
      }),
    ).toEqual({
      interval_seconds: 60,
      total_minutes: 12,
      is_alternating: true,
      alternating_stations: [[0], [1, 2]],
    });

    expect(
      normalizeFormatParams('emom', {
        interval_seconds: 60,
        total_minutes: 12,
        is_alternating: true,
        alternating_stations: [[1, 1]],
      }),
    ).toEqual({
      interval_seconds: 60,
      total_minutes: 12,
      is_alternating: true,
      alternating_stations: [[1]],
    });
  });
});

describe('validateBlockShape', () => {
  it('enforces superset cardinality', () => {
    expect(validateBlockShape('superset', 2, { rounds: 4 })).toBeNull();
    expect(validateBlockShape('superset', 3, { rounds: 4 })).toBe('superset_cardinality');
  });

  it('enforces circuit cardinality', () => {
    expect(validateBlockShape('circuit', 3, { rounds: 3 })).toBeNull();
    expect(validateBlockShape('circuit', 2, { rounds: 3 })).toBe('circuit_cardinality');
  });

  it('requires amrap time_cap_minutes', () => {
    expect(validateBlockShape('amrap', 1, {})).toBe('amrap_missing_time_cap');
    expect(validateBlockShape('amrap', 1, { time_cap_minutes: 12 })).toBeNull();
  });

  it('requires emom interval and duration', () => {
    expect(validateBlockShape('emom', 1, { interval_seconds: 60 })).toBe('emom_missing_params');
    expect(validateBlockShape('emom', 1, { interval_seconds: 60, total_minutes: 16 })).toBeNull();
    expect(validateBlockShape('emom', 1, { interval_seconds: 60, total_rounds: 10 })).toBeNull();
  });

  it('buildDefaultAlternatingStationsMatrix builds one index per exercise', () => {
    expect(buildDefaultAlternatingStationsMatrix(0)).toEqual([]);
    expect(buildDefaultAlternatingStationsMatrix(1)).toEqual([[0]]);
    expect(buildDefaultAlternatingStationsMatrix(3)).toEqual([[0], [1], [2]]);
  });

  it('buildComboAlternatingStationsMatrix pairs last two exercises on one minute', () => {
    expect(buildComboAlternatingStationsMatrix(2)).toEqual([[0, 1]]);
    expect(buildComboAlternatingStationsMatrix(3)).toEqual([[0], [1, 2]]);
    expect(buildComboAlternatingStationsMatrix(4)).toEqual([[0], [1], [2, 3]]);
    expect(buildComboAlternatingStationsMatrix(1)).toEqual([[0]]);
  });

  it('hydrateEmomAlternatingStations injects combo matrix and strips is_combo', () => {
    const base = { interval_seconds: 60, total_minutes: 10, is_alternating: true, is_combo: true };
    const hydrated = hydrateEmomAlternatingStations(3, base);
    expect(hydrated).toEqual({
      interval_seconds: 60,
      total_minutes: 10,
      is_alternating: true,
      alternating_stations: [[0], [1, 2]],
    });
    expect(hydrated).not.toHaveProperty('is_combo');
    expect(validateBlockShape('emom', 3, hydrated)).toBeNull();
  });

  it('hydrateEmomAlternatingStations combo does not overwrite explicit alternating_stations', () => {
    const base = {
      interval_seconds: 60,
      total_minutes: 10,
      is_alternating: true,
      is_combo: true,
      alternating_stations: [[0], [1]],
    };
    const hydrated = hydrateEmomAlternatingStations(3, base);
    expect(hydrated.alternating_stations).toEqual([[0], [1]]);
    expect(hydrated).not.toHaveProperty('is_combo');
  });

  it('hydrateEmomAlternatingStations injects matrix when missing', () => {
    const base = { interval_seconds: 60, total_minutes: 10, is_alternating: true };
    expect(hydrateEmomAlternatingStations(0, base)).toEqual(base);
    expect(hydrateEmomAlternatingStations(3, base)).toEqual({
      ...base,
      alternating_stations: [[0], [1], [2]],
    });
    expect(hydrateEmomAlternatingStations(3, { ...base, is_alternating: false })).toEqual({
      ...base,
      is_alternating: false,
    });
    expect(
      hydrateEmomAlternatingStations(3, {
        ...base,
        alternating_stations: [[0], [1, 2]],
      }),
    ).toEqual({ ...base, alternating_stations: [[0], [1, 2]] });
    expect(hydrateEmomAlternatingStations(3, { ...base, alternating_stations: [] })).toEqual({
      ...base,
      alternating_stations: [[0], [1], [2]],
    });
  });

  it('hydrateEmomAlternatingStations enables validateBlockShape for simple alternating EMOM', () => {
    const params = hydrateEmomAlternatingStations(3, {
      interval_seconds: 60,
      total_minutes: 12,
      is_alternating: true,
    });
    expect(validateBlockShape('emom', 3, params)).toBeNull();
  });

  it('validates alternating EMOM stations when is_alternating is true', () => {
    const params = {
      interval_seconds: 60,
      total_minutes: 12,
      is_alternating: true,
      alternating_stations: [[0], [1, 2]],
    };
    expect(validateBlockShape('emom', 3, params)).toBeNull();
    expect(validateBlockShape('emom', 2, params)).toBe('emom_alternating_invalid_stations');
    expect(validateBlockShape('emom', 3, { ...params, alternating_stations: [[0]] })).toBeNull();
    expect(
      validateBlockShape('emom', 3, {
        interval_seconds: 60,
        total_minutes: 12,
        is_alternating: true,
      }),
    ).toBe('emom_alternating_invalid_stations');
  });

  it('legacy emom with multiple exercises passes without alternating keys', () => {
    expect(validateBlockShape('emom', 2, { interval_seconds: 60, total_minutes: 16 })).toBeNull();
  });

  it('requires tabata rounds', () => {
    expect(validateBlockShape('tabata', 1, {})).toBe('tabata_missing_rounds');
    expect(validateBlockShape('tabata', 1, { rounds: 8 })).toBeNull();
  });

  it('requires ladder start_reps and peak_reps', () => {
    expect(validateBlockShape('ladder', 1, {})).toBe('ladder_missing_reps');
    expect(validateBlockShape('ladder', 1, { start_reps: 1 })).toBe('ladder_missing_reps');
    expect(
      validateBlockShape('ladder', 1, { start_reps: 1, peak_reps: 10, step_reps: 1 }),
    ).toBeNull();
  });

  it('enforces chipper cardinality and rounds', () => {
    expect(validateBlockShape('chipper', 2, { rounds: 1 })).toBe('chipper_cardinality');
    expect(validateBlockShape('chipper', 3, {})).toBe('chipper_missing_rounds');
    expect(validateBlockShape('chipper', 3, { rounds: 1 })).toBeNull();
  });

  it('requires pyramid start_reps and peak_reps', () => {
    expect(validateBlockShape('pyramid', 1, {})).toBe('pyramid_missing_reps');
    expect(validateBlockShape('pyramid', 1, { start_reps: 6, peak_reps: 12 })).toBeNull();
  });

  it('enforces contrast cardinality and rounds', () => {
    expect(validateBlockShape('contrast', 2, { rounds: 4 })).toBeNull();
    expect(validateBlockShape('contrast', 1, { rounds: 4 })).toBe('contrast_cardinality');
    expect(validateBlockShape('contrast', 3, { rounds: 4 })).toBe('contrast_cardinality');
    expect(validateBlockShape('contrast', 2, {})).toBe('contrast_missing_rounds');
  });

  it('requires clusters reps_per_cluster and clusters', () => {
    expect(validateBlockShape('clusters', 1, {})).toBe('clusters_missing_params');
    expect(validateBlockShape('clusters', 1, { reps_per_cluster: 3, clusters: 4 })).toBeNull();
  });

  it('requires drop_sets drop_percent and drops', () => {
    expect(validateBlockShape('drop_sets', 1, {})).toBe('drop_sets_missing_params');
    expect(validateBlockShape('drop_sets', 1, { drop_percent: 20, drops: 2 })).toBeNull();
  });

  it('always accepts straight_sets', () => {
    expect(validateBlockShape('straight_sets', 0, {})).toBeNull();
  });
});

describe('shouldInjectBlockBlueprintLibrary', () => {
  it('includes library on task rail surface', () => {
    expect(
      shouldInjectBlockBlueprintLibrary({ isRailSurface: true, blockBlueprintMentionCount: 0 }),
    ).toBe(true);
  });

  it('includes library when block mentions are present on any surface', () => {
    expect(
      shouldInjectBlockBlueprintLibrary({ isRailSurface: false, blockBlueprintMentionCount: 1 }),
    ).toBe(true);
  });

  it('always includes library on main bubble (no draft-intent gating)', () => {
    expect(
      shouldInjectBlockBlueprintLibrary({ isRailSurface: false, blockBlueprintMentionCount: 0 }),
    ).toBe(true);
  });

  it('includes library on main bubble draft-intent message', () => {
    expect(
      shouldInjectBlockBlueprintLibrary({
        isRailSurface: false,
        blockBlueprintMentionCount: 0,
        userMessageShowsDraftIntent: true,
      }),
    ).toBe(true);
  });
});

describe('userMessageShowsDraftIntent', () => {
  it('matches please draft the outline', () => {
    expect(userMessageShowsDraftIntent('Please draft the outline.')).toBe(true);
  });

  it('does not match generic readiness reply', () => {
    expect(userMessageShowsDraftIntent('I have a lot of energy, no soreness.')).toBe(false);
  });
});

describe('buildBlockBlueprintLibraryPrompt', () => {
  it('names enum values, schema keys, and hard rules', () => {
    const prose = buildBlockBlueprintLibraryPrompt();
    expect(prose).toContain(BLOCK_BLUEPRINT_LIBRARY_HEADER);
    for (const fmt of BLOCK_FORMAT_ENUM) {
      expect(prose).toContain(fmt);
    }
    expect(prose).toContain('block_format');
    expect(prose).toContain('format_params');
    expect(prose).toContain('time_cap_minutes');
    expect(prose).toContain('interval_seconds');
    expect(prose).toContain('rounds');
    expect(prose).toContain('work_seconds');
    expect(prose).toContain('exactly 2');
    expect(prose.toLowerCase()).toContain('instruction-only');
    expect(prose).toContain('derives them from interval_seconds');
    expect(prose).toContain('omit alternating_stations');
    expect(prose).toContain('auto-builds');
    expect(prose).toContain('ladder');
    expect(prose).toContain('chipper');
    expect(prose).toContain('start_reps');
    expect(prose).toContain('peak_reps');
    expect(prose).toContain('pyramid');
    expect(prose).toContain('contrast');
    expect(prose).toContain('clusters');
    expect(prose).toContain('drop_sets');
    expect(prose).toContain('reps_per_cluster');
    expect(prose).toContain('drop_percent');
  });
});
