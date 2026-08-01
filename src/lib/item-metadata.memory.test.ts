import { describe, expect, it } from 'vitest';
import { buildTaskMetadataPayload, metadataFieldsFromParsed } from '@/lib/item-metadata';

describe('memory metadata round-trip', () => {
  it('parses and builds people, linked_event, reactions, caption', () => {
    const fields = metadataFieldsFromParsed({
      caption: 'Great night',
      people: ['JF', 'MK'],
      linked_event: 'Block Party',
      reactions: [
        { e: '🎉', n: 24 },
        { emoji: '❤️', count: 2, reacted_by: ['u1'] },
      ],
    });

    expect(fields.memoryCaption).toBe('Great night');
    expect(fields.memoryPeople).toEqual(['JF', 'MK']);
    expect(fields.memoryLinkedEvent).toBe('Block Party');
    expect(fields.memoryReactions).toEqual([
      { emoji: '❤️', count: 2, reacted_by: ['u1'] },
      { emoji: '🎉', count: 24, reacted_by: [] },
    ]);

    const built = buildTaskMetadataPayload('memory', fields, {}) as Record<string, unknown>;
    expect(built.caption).toBe('Great night');
    expect(built.people).toEqual(['JF', 'MK']);
    expect(built.linked_event).toBe('Block Party');
    expect(built.reactions).toEqual([
      { emoji: '❤️', count: 2, reacted_by: ['u1'] },
      { emoji: '🎉', count: 24 },
    ]);
  });

  it('omits empty people / linked_event / reactions', () => {
    const fields = metadataFieldsFromParsed({});
    const built = buildTaskMetadataPayload('memory', fields, {
      people: ['stale'],
      linked_event: 'stale',
      reactions: [{ e: '🎉', n: 1 }],
    }) as Record<string, unknown>;
    expect(built.people).toBeUndefined();
    expect(built.linked_event).toBeUndefined();
    expect(built.reactions).toBeUndefined();
  });
});
