import { describe, expect, it } from 'vitest';
import {
  assignExerciseMentionsToBlocks,
  blockMeetsExerciseCardinality,
  buildDeterministicCoachBlocks,
  pickBlockBlueprintLane,
  resolveBlockBlueprintRouterGate,
  templateBlockAppendReply,
} from './block-blueprint-router';

const TABATA_MENTION = {
  token: ':finisher/tabata ',
  section_name: 'Finisher',
  section_role: 'finisher' as const,
  block_format: 'tabata' as const,
  format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
};

const PUSHUP = {
  token: '#Push-ups ',
  name: 'Push-ups',
  source: 'dictionary' as const,
};

describe('blockMeetsExerciseCardinality', () => {
  it('tabata needs at least one exercise', () => {
    expect(blockMeetsExerciseCardinality('tabata', 1)).toBe(true);
    expect(blockMeetsExerciseCardinality('tabata', 0)).toBe(false);
  });

  it('superset needs exactly two', () => {
    expect(blockMeetsExerciseCardinality('superset', 2)).toBe(true);
    expect(blockMeetsExerciseCardinality('superset', 1)).toBe(false);
  });
});

describe('assignExerciseMentionsToBlocks', () => {
  it('assigns all exercises to single block', () => {
    const msg = 'add :finisher/tabata #Push-ups #Burpees ';
    const assigned = assignExerciseMentionsToBlocks(
      msg,
      [TABATA_MENTION],
      [
        PUSHUP,
        {
          ...PUSHUP,
          token: '#Burpees ',
          name: 'Burpees',
        },
      ],
    );
    expect(assigned).toHaveLength(1);
    expect(assigned[0]!.exercises).toHaveLength(2);
  });

  it('assigns two exercises when last # tag has no trailing space at EOS', () => {
    const broad = { token: '#Broad Jumps ', name: 'Broad Jumps', source: 'dictionary' as const };
    const jump = { token: '#Jump Squats ', name: 'Jump Squats', source: 'dictionary' as const };
    const msg = "I'd like to add an :finisher/tabata with #Broad Jumps and #Jump Squats";
    const assigned = assignExerciseMentionsToBlocks(msg, [TABATA_MENTION], [broad, jump]);
    expect(assigned[0]!.exercises.map((e) => e.name)).toEqual(['Broad Jumps', 'Jump Squats']);
  });
});

describe('pickBlockBlueprintLane', () => {
  it('lane1 when tabata has one exercise', () => {
    const assigned = assignExerciseMentionsToBlocks(
      'x :finisher/tabata #Push-ups ',
      [TABATA_MENTION],
      [PUSHUP],
    );
    expect(pickBlockBlueprintLane(assigned)).toBe('lane1');
  });

  it('lane2 when superset has one exercise', () => {
    const superset = {
      ...TABATA_MENTION,
      block_format: 'superset' as const,
      token: ':main/superset ',
    };
    const assigned = assignExerciseMentionsToBlocks(
      'x :main/superset #Push-ups',
      [superset],
      [PUSHUP],
    );
    expect(pickBlockBlueprintLane(assigned)).toBe('lane2');
  });
});

describe('buildDeterministicCoachBlocks', () => {
  it('preserves format_params from client mention', () => {
    const assigned = assignExerciseMentionsToBlocks(
      'add :finisher/tabata #Push-ups ',
      [TABATA_MENTION],
      [PUSHUP],
    );
    const blocks = buildDeterministicCoachBlocks(assigned);
    expect(blocks[0]!.block_format).toBe('tabata');
    expect(blocks[0]!.format_params.rounds).toBe(8);
    expect(blocks[0]!.exercises).toEqual([{ name: 'Push-ups', sets: 1, reps: 'max' }]);
  });
});

describe('resolveBlockBlueprintRouterGate', () => {
  const richMeta = {
    ai_workout_factory: { workout_set: { workouts: [{ name: 'Main', exerciseBlocks: [] }] } },
  };

  it('eligible lane1 with rich workout and merge on', () => {
    const r = resolveBlockBlueprintRouterGate({
      isRailSurface: true,
      blockMentions: [TABATA_MENTION],
      knownTargetTaskId: 'task-1',
      taskMetadataForContext: richMeta,
      coachMergeWorkoutMetadata: true,
      messageText: 'add :finisher/tabata #Push-ups ',
      exerciseMentions: [PUSHUP],
    });
    expect(r.eligible).toBe(true);
    if (r.eligible) expect(r.lane).toBe('lane1');
  });

  it('ineligible when merge disabled', () => {
    const r = resolveBlockBlueprintRouterGate({
      isRailSurface: true,
      blockMentions: [TABATA_MENTION],
      knownTargetTaskId: 'task-1',
      taskMetadataForContext: richMeta,
      coachMergeWorkoutMetadata: false,
      messageText: 'add :finisher/tabata',
      exerciseMentions: null,
    });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('merge_disabled');
  });
});

describe('templateBlockAppendReply', () => {
  it('formats block and exercise names', () => {
    const assigned = assignExerciseMentionsToBlocks(
      'add :finisher/tabata #Push-ups ',
      [TABATA_MENTION],
      [PUSHUP],
    );
    const blocks = buildDeterministicCoachBlocks(assigned);
    expect(templateBlockAppendReply(blocks)).toContain('Finisher');
    expect(templateBlockAppendReply(blocks)).toContain('Push-ups');
  });
});
