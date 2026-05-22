import { describe, expect, it } from 'vitest';
import {
  countEmomStationLogRows,
  listEmomGlobalMinutesForStation,
  resolveEmomActiveStationIndices,
  resolveEmomLocalHighlightSetIndex,
} from './resolve-emom-alternating';

const abcParams = {
  interval_seconds: 60,
  total_rounds: 10,
  is_alternating: true,
  alternating_stations: [[0], [1], [2]],
} as const;

const abBcParams = {
  interval_seconds: 60,
  total_rounds: 12,
  is_alternating: true,
  alternating_stations: [[0], [1, 2]],
} as const;

describe('countEmomStationLogRows', () => {
  it('allocates 4/3/3 rows for 10-minute A/B/C cycle', () => {
    expect(countEmomStationLogRows(0, abcParams)).toBe(4);
    expect(countEmomStationLogRows(1, abcParams)).toBe(3);
    expect(countEmomStationLogRows(2, abcParams)).toBe(3);
  });

  it('allocates 6 rows each for 12-minute A / B+C cycle', () => {
    expect(countEmomStationLogRows(0, abBcParams)).toBe(6);
    expect(countEmomStationLogRows(1, abBcParams)).toBe(6);
    expect(countEmomStationLogRows(2, abBcParams)).toBe(6);
  });
});

describe('resolveEmomActiveStationIndices', () => {
  it('returns station indices for current minute slot', () => {
    expect(resolveEmomActiveStationIndices(abBcParams, 0)).toEqual([0]);
    expect(resolveEmomActiveStationIndices(abBcParams, 1)).toEqual([1, 2]);
    expect(resolveEmomActiveStationIndices(abBcParams, 2)).toEqual([0]);
  });

  it('returns null for legacy EMOM params', () => {
    expect(
      resolveEmomActiveStationIndices({ interval_seconds: 60, total_minutes: 16 }, 0),
    ).toBeNull();
  });
});

describe('resolveEmomLocalHighlightSetIndex', () => {
  it('maps global minute to local occurrence index for active station', () => {
    expect(resolveEmomLocalHighlightSetIndex(0, 9, abcParams)).toBe(3);
    expect(resolveEmomLocalHighlightSetIndex(1, 9, abcParams)).toBeNull();
  });

  it('returns null when station inactive this minute', () => {
    expect(resolveEmomLocalHighlightSetIndex(0, 1, abcParams)).toBeNull();
    expect(resolveEmomLocalHighlightSetIndex(1, 1, abcParams)).toBe(0);
  });
});

describe('listEmomGlobalMinutesForStation', () => {
  it('lists global minutes for station A in ABC cycle', () => {
    expect(listEmomGlobalMinutesForStation(0, abcParams)).toEqual([0, 3, 6, 9]);
  });
});
