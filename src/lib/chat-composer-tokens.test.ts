import { describe, expect, it } from 'vitest';
import {
  lastBlockColonIndex,
  lastExerciseHashIndex,
  lastTaskMentionSlashIndex,
  parseBlockTriggerQuery,
  parseHashTriggerQuery,
  resolveActiveComposerTrigger,
} from '@/lib/chat-composer-tokens';

describe('lastExerciseHashIndex', () => {
  it('returns 0 for hash at start of string', () => {
    expect(lastExerciseHashIndex('#squat')).toBe(0);
  });

  it('returns index after whitespace boundary', () => {
    expect(lastExerciseHashIndex('try #squat')).toBe(4);
  });

  it('returns -1 for hash inside a word (no boundary)', () => {
    expect(lastExerciseHashIndex('foo#bar')).toBe(-1);
  });

  it('returns the rightmost hash with valid boundary (closest to end)', () => {
    expect(lastExerciseHashIndex('a #one b #two')).toBe(9);
  });

  it('matches lastTaskMentionSlashIndex boundary style for #', () => {
    const s = 'x\t#y';
    expect(lastExerciseHashIndex(s)).toBe(2);
  });
});

describe('lastTaskMentionSlashIndex (sanity for composer parity)', () => {
  it('does not match slash inside a URL', () => {
    expect(lastTaskMentionSlashIndex('https://x.com/a')).toBe(-1);
  });
});

describe('parseHashTriggerQuery', () => {
  it('allows multi-word search query', () => {
    expect(parseHashTriggerQuery('hi #bulgarian split')).toEqual({
      start: 3,
      searchQuery: 'bulgarian split',
      rawQuery: 'bulgarian split',
    });
  });

  it('returns null when more than 4 words', () => {
    const q = 'a b c d e';
    expect(parseHashTriggerQuery(`#${q}`)).toBeNull();
  });
});

describe('lastBlockColonIndex', () => {
  it('returns index after whitespace boundary', () => {
    expect(lastBlockColonIndex('add :amrap')).toBe(4);
  });

  it('returns -1 for time-like digit before colon', () => {
    expect(lastBlockColonIndex('rest 10:30')).toBe(-1);
  });

  it('returns -1 for colon inside a word', () => {
    expect(lastBlockColonIndex('foo:bar')).toBe(-1);
  });
});

describe('parseBlockTriggerQuery', () => {
  it('parses section/format composite query', () => {
    expect(parseBlockTriggerQuery('hi :finisher/amr')).toEqual({
      start: 3,
      query: 'finisher/amr',
    });
  });

  it('returns null when query contains spaces', () => {
    expect(parseBlockTriggerQuery(':finisher amrap')).toBeNull();
  });
});

describe('resolveActiveComposerTrigger', () => {
  const allOn = { enableAt: true, enableSlash: true, enableHash: true, enableBlock: true };

  it('picks hash when it is rightmost before cursor', () => {
    const t = '@joe #sq';
    expect(resolveActiveComposerTrigger(t, allOn)).toEqual({
      kind: 'hash',
      start: 5,
      query: 'sq',
      rawQuery: 'sq',
    });
  });

  it('picks mention when it is rightmost', () => {
    const t = '#squat @j';
    expect(resolveActiveComposerTrigger(t, allOn)).toEqual({
      kind: 'mention',
      start: 7,
      query: 'j',
    });
  });

  it('picks block when it is rightmost', () => {
    const t = '#squat :amr';
    expect(resolveActiveComposerTrigger(t, allOn)).toEqual({
      kind: 'block',
      start: 7,
      query: 'amr',
    });
  });
});
