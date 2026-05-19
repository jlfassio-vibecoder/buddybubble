import { describe, expect, it } from 'vitest';
import {
  composerMentionTokenInMessage,
  formatTaggedExerciseRefsPromptBlock,
  parseExerciseMentionsFromMetadata,
  parseExerciseNamesFromWorkoutContextJson,
  resolveExerciseMentionLines,
  TAGGED_EXERCISE_REFS_HEADER,
} from './exercise-mentions';

describe('composerMentionTokenInMessage', () => {
  it('matches token with trailing space in mid-message', () => {
    const msg = 'add #Broad Jumps and more';
    expect(composerMentionTokenInMessage(msg, '#Broad Jumps ')).toBe(true);
  });

  it('matches EOS tag when stored token has trailing space', () => {
    const msg = 'like #Broad Jumps and #Jump Squats';
    expect(composerMentionTokenInMessage(msg, '#Jump Squats ')).toBe(true);
  });

  it('rejects mention not present', () => {
    expect(composerMentionTokenInMessage('hello', '#Removed ')).toBe(false);
  });

  it('matches both tags in realistic finisher message', () => {
    const msg = "I'd like to add an :finisher/tabata with #Broad Jumps and #Jump Squats";
    expect(composerMentionTokenInMessage(msg, '#Broad Jumps ')).toBe(true);
    expect(composerMentionTokenInMessage(msg, '#Jump Squats ')).toBe(true);
  });
});

describe('parseExerciseNamesFromWorkoutContextJson', () => {
  it('returns names in array order', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'A' }, { name: 'B' }],
    });
    expect(parseExerciseNamesFromWorkoutContextJson(json)).toEqual(['A', 'B']);
  });

  it('accepts root-level exercises array', () => {
    expect(parseExerciseNamesFromWorkoutContextJson(JSON.stringify([{ name: 'Squat' }]))).toEqual([
      'Squat',
    ]);
  });

  it('returns null on invalid JSON', () => {
    expect(parseExerciseNamesFromWorkoutContextJson('not json')).toBeNull();
  });
});

describe('parseExerciseMentionsFromMetadata', () => {
  it('returns null when missing or invalid', () => {
    expect(parseExerciseMentionsFromMetadata(null)).toBeNull();
    expect(parseExerciseMentionsFromMetadata({})).toBeNull();
    expect(parseExerciseMentionsFromMetadata({ exercise_mentions: [] })).toBeNull();
    expect(parseExerciseMentionsFromMetadata({ exercise_mentions: 'x' })).toBeNull();
  });

  it('parses valid rows', () => {
    const out = parseExerciseMentionsFromMetadata({
      exercise_mentions: [
        { token: '#Squat ', name: 'Squat', source: 'workout', workout_exercise_index: 1 },
        { token: '#X ', name: 'X', dictionary_id: 'uuid-1' },
      ],
    });
    expect(out).toEqual([
      { token: '#Squat ', name: 'Squat', source: 'workout', workout_exercise_index: 1 },
      { token: '#X ', name: 'X', source: 'dictionary', dictionary_id: 'uuid-1' },
    ]);
  });
});

describe('resolveExerciseMentionLines', () => {
  const wc = JSON.stringify({
    exercises: [{ name: 'Leg Swings' }, { name: 'Kettlebell Goblet Squat' }],
  });

  it('uses client hint when name still matches that index', () => {
    const lines = resolveExerciseMentionLines(
      [
        {
          token: '#Kettlebell Goblet Squat ',
          name: 'Kettlebell Goblet Squat',
          source: 'dictionary',
          workout_exercise_index: 1,
        },
      ],
      wc,
    );
    expect(lines).toEqual(['"#Kettlebell Goblet Squat " -> exerciseIndex=1']);
  });

  it('resolves by name when hint missing', () => {
    const lines = resolveExerciseMentionLines(
      [{ token: '#Leg Swings ', name: 'Leg Swings', source: 'dictionary' }],
      wc,
    );
    expect(lines).toEqual(['"#Leg Swings " -> exerciseIndex=0']);
  });

  it('marks NOT_IN_ACTIVE_WORKOUT when name not in session', () => {
    const lines = resolveExerciseMentionLines(
      [{ token: '#Bench ', name: 'Bench Press', source: 'dictionary' }],
      wc,
    );
    expect(lines).toEqual(['"#Bench " -> NOT_IN_ACTIVE_WORKOUT']);
  });

  it('marks all NOT_IN_ACTIVE_WORKOUT when no workout context', () => {
    const lines = resolveExerciseMentionLines(
      [{ token: '#Squat ', name: 'Squat', source: 'workout' }],
      null,
    );
    expect(lines).toEqual(['"#Squat " -> NOT_IN_ACTIVE_WORKOUT']);
  });

  it('rejects stale hint when name no longer matches index', () => {
    const lines = resolveExerciseMentionLines(
      [
        {
          token: '#Kettlebell Goblet Squat ',
          name: 'Kettlebell Goblet Squat',
          source: 'workout',
          workout_exercise_index: 0,
        },
      ],
      wc,
    );
    expect(lines).toEqual(['"#Kettlebell Goblet Squat " -> exerciseIndex=1']);
  });

  it('uses first match for duplicate names', () => {
    const dup = JSON.stringify({
      exercises: [{ name: 'Squat' }, { name: 'Squat' }],
    });
    const lines = resolveExerciseMentionLines(
      [{ token: '#Squat ', name: 'Squat', source: 'workout' }],
      dup,
    );
    expect(lines[0]).toContain('exerciseIndex=0');
    expect(lines[0]).toContain('ambiguous_name_first_match');
  });
});

describe('formatTaggedExerciseRefsPromptBlock', () => {
  it('returns null for empty lines', () => {
    expect(formatTaggedExerciseRefsPromptBlock([])).toBeNull();
  });

  it('includes header and directive', () => {
    const block = formatTaggedExerciseRefsPromptBlock(['"#A " -> exerciseIndex=0']);
    expect(block).toContain(TAGGED_EXERCISE_REFS_HEADER);
    expect(block).toContain('NOT_IN_ACTIVE_WORKOUT');
    expect(block).toContain('execution_patch.exerciseIndex');
  });
});
