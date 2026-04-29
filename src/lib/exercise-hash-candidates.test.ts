import { describe, expect, it } from 'vitest';
import {
  rankExercisesForHashQuery,
  shouldSuppressHashPopoverAfterSelection,
} from '@/lib/exercise-hash-candidates';
import type { RichMessageComposerExercise } from '@/components/chat/RichMessageComposer';

function ex(id: string, name: string, slug?: string): RichMessageComposerExercise {
  return { id, name, status: 'published', ...(slug ? { slug } : {}) };
}

describe('shouldSuppressHashPopoverAfterSelection', () => {
  it('suppresses when trailing space and exact name match', () => {
    const s = new Set(['goblet squat']);
    expect(shouldSuppressHashPopoverAfterSelection('Goblet Squat ', s)).toBe(true);
  });

  it('does not suppress when no trailing space', () => {
    const s = new Set(['goblet squat']);
    expect(shouldSuppressHashPopoverAfterSelection('Goblet Squat', s)).toBe(false);
  });
});

describe('rankExercisesForHashQuery', () => {
  const list: RichMessageComposerExercise[] = [
    ex('1', 'Bulgarian Split Squat'),
    ex('2', 'Goblet Squat'),
    ex('3', 'Back Squat'),
  ];

  it('ranks exact match first', () => {
    const r = rankExercisesForHashQuery(list, 'goblet squat');
    expect(r[0]?.name).toBe('Goblet Squat');
  });

  it('returns non-empty for multi-word ordered query', () => {
    const r = rankExercisesForHashQuery(list, 'bulgarian split');
    expect(r.map((e) => e.id)).toContain('1');
  });
});
