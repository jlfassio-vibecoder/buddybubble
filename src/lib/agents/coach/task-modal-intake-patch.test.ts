import { describe, expect, it } from 'vitest';

import { parseAndCollectTaskModalIntakePatchFromGemini } from './task-modal-intake-patch';

describe('parseAndCollectTaskModalIntakePatchFromGemini', () => {
  it('returns null patch and no drops for non-object input', () => {
    expect(parseAndCollectTaskModalIntakePatchFromGemini(null)).toEqual({
      patch: null,
      dropped: [],
    });
    expect(parseAndCollectTaskModalIntakePatchFromGemini([])).toEqual({
      patch: null,
      dropped: [],
    });
  });

  it('records unknown_key and still parses known fields', () => {
    const { patch, dropped } = parseAndCollectTaskModalIntakePatchFromGemini({
      readiness: 6,
      extraCoachField: true,
    });
    expect(patch).toEqual({ readiness: 6 });
    expect(dropped.some((d) => d.field === 'extraCoachField' && d.reason === 'unknown_key')).toBe(
      true,
    );
  });

  it('records clamped readiness and soreness_none_combination', () => {
    const { patch, dropped } = parseAndCollectTaskModalIntakePatchFromGemini({
      readiness: 150,
      soreness: ['None', 'Legs'],
    });
    expect(patch?.readiness).toBe(10);
    expect(patch?.soreness).toEqual(['Legs']);
    expect(dropped.some((d) => d.reason === 'clamped' && d.field === 'readiness')).toBe(true);
    expect(dropped.some((d) => d.reason === 'soreness_none_combination')).toBe(true);
  });

  it('records invalid_enum for bad soreness token', () => {
    const { patch, dropped } = parseAndCollectTaskModalIntakePatchFromGemini({
      soreness: ['Feet'],
    });
    expect(patch).toBeNull();
    expect(dropped.some((d) => d.reason === 'invalid_enum' && d.field === 'soreness')).toBe(true);
  });

  it('records unknown_key for legacy equipment patches', () => {
    const { patch, dropped } = parseAndCollectTaskModalIntakePatchFromGemini({
      equipment: ['Kettlebell'],
    });
    expect(patch).toBeNull();
    expect(dropped.some((d) => d.field === 'equipment' && d.reason === 'unknown_key')).toBe(true);
  });
});
