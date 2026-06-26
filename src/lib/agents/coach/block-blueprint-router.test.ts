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

  it('ladder needs at least one exercise', () => {
    expect(blockMeetsExerciseCardinality('ladder', 1)).toBe(true);
    expect(blockMeetsExerciseCardinality('ladder', 0)).toBe(false);
  });

  it('chipper needs at least three exercises', () => {
    expect(blockMeetsExerciseCardinality('chipper', 3)).toBe(true);
    expect(blockMeetsExerciseCardinality('chipper', 2)).toBe(false);
  });

  it('contrast needs exactly two exercises', () => {
    expect(blockMeetsExerciseCardinality('contrast', 2)).toBe(true);
    expect(blockMeetsExerciseCardinality('contrast', 1)).toBe(false);
    expect(blockMeetsExerciseCardinality('contrast', 3)).toBe(false);
  });

  it('pyramid clusters and drop_sets need at least one exercise', () => {
    expect(blockMeetsExerciseCardinality('pyramid', 1)).toBe(true);
    expect(blockMeetsExerciseCardinality('clusters', 1)).toBe(true);
    expect(blockMeetsExerciseCardinality('drop_sets', 1)).toBe(true);
    expect(blockMeetsExerciseCardinality('pyramid', 0)).toBe(false);
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

  it('lane1 when ladder has one exercise', () => {
    const ladder = {
      ...TABATA_MENTION,
      block_format: 'ladder' as const,
      token: ':finisher/ladder/core ',
      format_params: { start_reps: 1, peak_reps: 10, step_reps: 1, direction: 'ascending' },
    };
    const assigned = assignExerciseMentionsToBlocks(
      'x :finisher/ladder/core #Push-ups ',
      [ladder],
      [PUSHUP],
    );
    expect(pickBlockBlueprintLane(assigned)).toBe('lane1');
  });

  it('lane2 when chipper has two exercises', () => {
    const chipper = {
      ...TABATA_MENTION,
      block_format: 'chipper' as const,
      token: ':finisher/chipper/core ',
      format_params: { rounds: 1 },
    };
    const assigned = assignExerciseMentionsToBlocks(
      'x :finisher/chipper/core #Push-ups #Burpees',
      [chipper],
      [PUSHUP, { ...PUSHUP, token: '#Burpees ', name: 'Burpees' }],
    );
    expect(pickBlockBlueprintLane(assigned)).toBe('lane2');
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

  it('pads tabata placeholders when user states more exercises than # tags', () => {
    const assigned = assignExerciseMentionsToBlocks(
      'add :finisher/hiit/classic with 4 exercises #Burpees #Mountain Climbers ',
      [
        {
          ...TABATA_MENTION,
          token: ':finisher/hiit/classic ',
          format_params: {
            work_seconds: 30,
            rest_seconds: 30,
            rounds: 3,
            interval_preset: 'classic_hiit',
          },
        },
      ],
      [
        { token: '#Burpees ', name: 'Burpees', source: 'dictionary' as const },
        { token: '#Mountain Climbers ', name: 'Mountain Climbers', source: 'dictionary' as const },
      ],
    );
    const blocks = buildDeterministicCoachBlocks(
      assigned,
      'add :finisher/hiit/classic with 4 exercises #Burpees #Mountain Climbers ',
    );
    expect(blocks[0]!.exercises).toHaveLength(4);
    expect(blocks[0]!.exercises.map((e) => (e as { name: string }).name)).toEqual([
      'Burpees',
      'Mountain Climbers',
      'Movement 3',
      'Movement 4',
    ]);
  });

  it('pads tabata placeholders using stated count scoped to each block token', () => {
    const msg =
      'add :main/hiit/classic with 2 exercises #Squats add :finisher/hiit/classic with 4 exercises #Burpees #Mountain Climbers ';
    const mainMention = {
      ...TABATA_MENTION,
      token: ':main/hiit/classic ',
      section_name: 'Main',
      section_role: 'main' as const,
      format_params: {
        work_seconds: 30,
        rest_seconds: 30,
        rounds: 3,
        interval_preset: 'classic_hiit',
      },
    };
    const finisherMention = {
      ...TABATA_MENTION,
      token: ':finisher/hiit/classic ',
      format_params: {
        work_seconds: 30,
        rest_seconds: 30,
        rounds: 3,
        interval_preset: 'classic_hiit',
      },
    };
    const assigned = assignExerciseMentionsToBlocks(
      msg,
      [mainMention, finisherMention],
      [
        { token: '#Squats ', name: 'Squats', source: 'dictionary' as const },
        { token: '#Burpees ', name: 'Burpees', source: 'dictionary' as const },
        { token: '#Mountain Climbers ', name: 'Mountain Climbers', source: 'dictionary' as const },
      ],
    );
    const blocks = buildDeterministicCoachBlocks(assigned, msg);
    expect(blocks[0]!.exercises).toHaveLength(2);
    expect(blocks[1]!.exercises).toHaveLength(4);
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
