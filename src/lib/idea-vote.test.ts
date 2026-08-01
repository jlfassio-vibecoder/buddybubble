import { describe, expect, it } from 'vitest';
import { ideaVoteState, readIdeaVotedBy, readIdeaVotes, toggleIdeaVote } from '@/lib/idea-vote';

describe('idea-vote', () => {
  it('reads votes and voted_by', () => {
    expect(readIdeaVotes({ votes: 4 })).toBe(4);
    expect(readIdeaVotes({ votes: '3' })).toBe(3);
    expect(readIdeaVotes({})).toBe(0);
    expect(readIdeaVotedBy({ voted_by: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(readIdeaVotedBy({})).toEqual([]);
  });

  it('derives voted from voted_by and preserves legacy count', () => {
    expect(ideaVoteState({ votes: 4 }, 'u1')).toEqual({
      votes: 4,
      voted: false,
      votedBy: [],
    });
    expect(ideaVoteState({ votes: 1, voted_by: ['u1'] }, 'u1')).toEqual({
      votes: 1,
      voted: true,
      votedBy: ['u1'],
    });
    expect(ideaVoteState({ votes: 5, voted_by: ['u1'] }, 'u2')).toEqual({
      votes: 5,
      voted: false,
      votedBy: ['u1'],
    });
  });

  it('toggles vote with legacy remainder', () => {
    const afterUp = toggleIdeaVote({ votes: 4 }, 'u1');
    expect(afterUp).toEqual({ votedBy: ['u1'], votes: 5 });

    const afterDown = toggleIdeaVote({ votes: 5, voted_by: ['u1'] }, 'u1');
    expect(afterDown).toEqual({ votedBy: [], votes: 4 });
  });

  it('toggles among known voters', () => {
    const after = toggleIdeaVote({ votes: 2, voted_by: ['a', 'b'] }, 'c');
    expect(after).toEqual({ votedBy: ['a', 'b', 'c'], votes: 3 });

    const removed = toggleIdeaVote({ votes: 3, voted_by: ['a', 'b', 'c'] }, 'b');
    expect(removed).toEqual({ votedBy: ['a', 'c'], votes: 2 });
  });
});
