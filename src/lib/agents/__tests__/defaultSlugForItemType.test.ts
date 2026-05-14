import { describe, it, expect } from 'vitest';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { defaultSlugForItemType } from '@/lib/agents/defaultSlugForItemType';
import type { ItemType } from '@/lib/item-types';

/** Every `ItemType` member — compile-time guard when `item-types.ts` adds a variant. */
const ALL_ITEM_TYPES = [
  'task',
  'event',
  'experience',
  'idea',
  'memory',
  'workout',
  'workout_log',
  'program',
  'class',
] as const satisfies readonly ItemType[];

describe('defaultSlugForItemType', () => {
  it('returns COACH_SLUG for Phase 0 §3c coach-mapped types', () => {
    const coachMapped: ItemType[] = [
      'task',
      'event',
      'experience',
      'idea',
      'memory',
      'workout',
      'workout_log',
      'program',
    ];
    for (const t of coachMapped) {
      expect(defaultSlugForItemType(t)).toBe(COACH_SLUG);
    }
  });

  it('returns null for class', () => {
    expect(defaultSlugForItemType('class')).toBeNull();
  });

  it('returns null for null, undefined, and unknown', () => {
    expect(defaultSlugForItemType(null)).toBeNull();
    expect(defaultSlugForItemType(undefined)).toBeNull();
    expect(defaultSlugForItemType('not-an-item-type' as never)).toBeNull();
  });

  it('exercises every ItemType union member', () => {
    for (const t of ALL_ITEM_TYPES) {
      const got = defaultSlugForItemType(t);
      if (t === 'class') {
        expect(got).toBeNull();
      } else {
        expect(got).toBe(COACH_SLUG);
      }
    }
  });
});
