import { describe, expect, it } from 'vitest';
import {
  emomStationIndexToLetter,
  formatAlternatingEmomTaxonomy,
} from './format-alternating-taxonomy';

describe('emomStationIndexToLetter', () => {
  it('maps 0-based indices to A–Z', () => {
    expect(emomStationIndexToLetter(0)).toBe('A');
    expect(emomStationIndexToLetter(1)).toBe('B');
    expect(emomStationIndexToLetter(2)).toBe('C');
    expect(emomStationIndexToLetter(25)).toBe('Z');
  });

  it('uses defensive fallback beyond Z', () => {
    expect(emomStationIndexToLetter(26)).toBe('S27');
  });

  it('returns empty for invalid indices', () => {
    expect(emomStationIndexToLetter(-1)).toBe('');
    expect(emomStationIndexToLetter(Number.NaN)).toBe('');
  });
});

describe('formatAlternatingEmomTaxonomy', () => {
  it('formats A / B+C cycle', () => {
    expect(formatAlternatingEmomTaxonomy([[0], [1, 2]])).toBe('A / B+C');
  });

  it('formats single-station A / B / C cycle', () => {
    expect(formatAlternatingEmomTaxonomy([[0], [1], [2]])).toBe('A / B / C');
  });

  it('formats repeating minute slots', () => {
    expect(formatAlternatingEmomTaxonomy([[0], [0]])).toBe('A / A');
  });

  it('returns empty for empty cycle', () => {
    expect(formatAlternatingEmomTaxonomy([])).toBe('');
  });

  it('truncates float indices', () => {
    expect(formatAlternatingEmomTaxonomy([[1.9], [2.1]])).toBe('B / C');
  });
});
