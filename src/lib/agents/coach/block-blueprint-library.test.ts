import { describe, expect, it } from 'vitest';

import {
  BLOCK_BLUEPRINT_LIBRARY_HEADER,
  BLOCK_FORMAT_ENUM,
  buildBlockBlueprintLibraryPrompt,
  mapLegacyTypeToBlockFormat,
  normalizeFormatParams,
  shouldInjectBlockBlueprintLibrary,
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

  it('excludes library on main bubble without block mentions', () => {
    expect(
      shouldInjectBlockBlueprintLibrary({ isRailSurface: false, blockBlueprintMentionCount: 0 }),
    ).toBe(false);
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
