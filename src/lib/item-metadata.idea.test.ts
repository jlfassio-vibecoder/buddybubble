import { describe, expect, it } from 'vitest';
import { buildTaskMetadataPayload, metadataFieldsFromParsed } from '@/lib/item-metadata';

describe('idea metadata round-trip', () => {
  it('parses and builds votes / voted_by', () => {
    const fields = metadataFieldsFromParsed({
      votes: 5,
      voted_by: ['u1', 'u2'],
      effort: 'Low',
    });
    expect(fields.ideaVotes).toBe(5);
    expect(fields.ideaVotedBy).toEqual(['u1', 'u2']);
    expect(fields.ideaEffort).toBe('Low');

    const built = buildTaskMetadataPayload('idea', fields, {}) as Record<string, unknown>;
    expect(built.votes).toBe(5);
    expect(built.voted_by).toEqual(['u1', 'u2']);
    expect(built.effort).toBe('Low');
  });

  it('preserves legacy votes when voted_by is empty', () => {
    const fields = metadataFieldsFromParsed({ votes: 4 });
    expect(fields.ideaVotes).toBe(4);
    expect(fields.ideaVotedBy).toEqual([]);
    const built = buildTaskMetadataPayload('idea', fields, {}) as Record<string, unknown>;
    expect(built.votes).toBe(4);
    expect(built.voted_by).toBeUndefined();
  });
});
