import { describe, expect, it } from 'vitest';
import { aggregateMessageReactions, MESSAGE_REACTION_EMOJIS } from '@/lib/message-reactions';

describe('aggregateMessageReactions', () => {
  it('aggregates counts and reactedByMe for the viewer', () => {
    const out = aggregateMessageReactions(
      [
        { message_id: 'm1', user_id: 'u1', emoji: '👍' },
        { message_id: 'm1', user_id: 'u2', emoji: '👍' },
        { message_id: 'm1', user_id: 'u1', emoji: '❤️' },
        { message_id: 'm2', user_id: 'u3', emoji: '🎉' },
      ],
      'u1',
    );

    expect(out.m1).toEqual([
      { emoji: '👍', count: 2, reactedByMe: true },
      { emoji: '❤️', count: 1, reactedByMe: true },
    ]);
    expect(out.m2).toEqual([{ emoji: '🎉', count: 1, reactedByMe: false }]);
  });

  it('sorts closed-set emojis in MESSAGE_REACTION_EMOJIS order', () => {
    const out = aggregateMessageReactions(
      [
        { message_id: 'm1', user_id: 'u1', emoji: '👀' },
        { message_id: 'm1', user_id: 'u1', emoji: '👍' },
      ],
      null,
    );
    expect(out.m1?.map((r) => r.emoji)).toEqual(['👍', '👀']);
    expect(MESSAGE_REACTION_EMOJIS[0]).toBe('👍');
  });
});
