import { describe, expect, it } from 'vitest';
import {
  memoryReactionAggs,
  parseMemoryMomentReactions,
  toggleMemoryMomentReaction,
} from '@/lib/memory-moment-reactions';

describe('memory-moment-reactions', () => {
  it('parses handoff e/n and emoji/count/reacted_by', () => {
    expect(
      parseMemoryMomentReactions([
        { e: '🎉', n: 24 },
        { emoji: '❤️', count: 2, reacted_by: ['u1', 'u2'] },
      ]),
    ).toEqual([
      { emoji: '❤️', count: 2, reacted_by: ['u1', 'u2'] },
      { emoji: '🎉', count: 24, reacted_by: [] },
    ]);
  });

  it('builds aggs for viewer', () => {
    const aggs = memoryReactionAggs([{ emoji: '🎉', count: 3, reacted_by: ['u1'] }], 'u1');
    expect(aggs).toEqual([{ emoji: '🎉', count: 3, reactedByMe: true }]);
  });

  it('toggles with legacy remainder', () => {
    const afterUp = toggleMemoryMomentReaction(
      [{ emoji: '🎉', count: 24, reacted_by: [] }],
      '🎉',
      'u1',
    );
    expect(afterUp).toEqual([{ emoji: '🎉', count: 25, reacted_by: ['u1'] }]);

    const afterDown = toggleMemoryMomentReaction(afterUp, '🎉', 'u1');
    expect(afterDown).toEqual([{ emoji: '🎉', count: 24, reacted_by: [] }]);
  });

  it('adds a new emoji and removes when count hits zero', () => {
    const added = toggleMemoryMomentReaction([], '👍', 'u1');
    expect(added).toEqual([{ emoji: '👍', count: 1, reacted_by: ['u1'] }]);
    expect(toggleMemoryMomentReaction(added, '👍', 'u1')).toEqual([]);
  });
});
