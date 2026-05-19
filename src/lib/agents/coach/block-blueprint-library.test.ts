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

  it('drops non-finite values', () => {
    const out = normalizeFormatParams('amrap', {
      time_cap_minutes: Number.NaN,
    });
    expect(out).toEqual({});
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
  });
});
