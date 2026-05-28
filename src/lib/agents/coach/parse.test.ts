/**
 * Vitest coverage for the lifted Coach parser.
 *
 * Focuses on the edge cases the inline parser handles today (alternate keys, body
 * coercion, code-fence stripping, intake-enum coercion, execution-patch sanitation).
 * Each spec exercises ONE helper or one branch of `parseCoachJson` so a regression in
 * the lift surfaces as a single failed assertion rather than a blanket "shape changed"
 * error.
 */

import { describe, expect, it } from 'vitest';

import {
  COACH_TASK_NOTES_MAX_CHARS,
  COACH_TASK_SEED_CTA,
  PERSONAL_CUES_FIELD_MAX_CHARS,
} from './config';
import {
  coalesceTaskDescription,
  coalesceUpdatedTaskDescription,
  ensureCoachTaskNotesCta,
  parseCoachJson,
  parseExecutionPatchFromGemini,
  parseIntakePhase,
  parseMissingIntakeCategories,
  parsePersonalCuesPatchFromGemini,
  parseCoachWorkoutOutlineWithDrops,
  parseCoachOutlineOnlyBlocksFromText,
  parseProposedWorkoutMetadata,
  parseProposedWorkoutMetadataWithDrops,
  parseOutlineDraftPatchFromGemini,
  parseSessionReadinessScore,
  stripMarkdownCodeFences,
} from './parse';

const REQUIRED_TAIL = {
  update_existing_task: false,
  updated_task_title: null,
  updated_task_description: null,
  proposed_workout_metadata: null,
};

function makeReplyOnlyPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reply_content: 'hi',
    create_card: false,
    task_title: null,
    task_description: null,
    ...REQUIRED_TAIL,
    ...extra,
  };
}

describe('coalesceTaskDescription', () => {
  it('prefers task_description when populated', () => {
    expect(coalesceTaskDescription({ task_description: '  body  ' })).toBe('body');
  });

  it('falls back to description alternate key', () => {
    expect(coalesceTaskDescription({ description: 'desc body' })).toBe('desc body');
  });

  it('falls back to camelCase taskDescription alternate key', () => {
    expect(coalesceTaskDescription({ taskDescription: 'camel body' })).toBe('camel body');
  });

  it('joins string[] bodies with newlines', () => {
    expect(coalesceTaskDescription({ task_description: ['a', 'b', 'c'] })).toBe('a\nb\nc');
  });

  it('returns null when no candidate matches', () => {
    expect(coalesceTaskDescription({ task_description: 42 })).toBeNull();
    expect(coalesceTaskDescription({})).toBeNull();
  });
});

describe('coalesceUpdatedTaskDescription', () => {
  it('prefers updated_task_description when populated', () => {
    expect(coalesceUpdatedTaskDescription({ updated_task_description: 'body' })).toBe('body');
  });

  it('falls back to camelCase updatedTaskDescription', () => {
    expect(coalesceUpdatedTaskDescription({ updatedTaskDescription: 'camel' })).toBe('camel');
  });

  it('joins string[] bodies with newlines', () => {
    expect(coalesceUpdatedTaskDescription({ updated_task_description: ['x', 'y'] })).toBe('x\ny');
  });

  it('returns null when no candidate matches', () => {
    expect(coalesceUpdatedTaskDescription({ updated_task_description: null })).toBeNull();
  });
});

describe('parseProposedWorkoutMetadata', () => {
  it('returns empty object when no payload', () => {
    expect(parseProposedWorkoutMetadata({})).toEqual({});
  });

  it('passes through structured exercises and trims string fields', () => {
    const out = parseProposedWorkoutMetadata({
      proposed_workout_metadata: {
        workout_type: '  AMRAP  ',
        duration_min: 32.4,
        exercises: [
          {
            name: '  Push-up  ',
            sets: 3.6,
            reps: '10',
            coach_notes: '  control descent  ',
            equipment: '  bands  ',
          },
          // Skipped: missing name.
          { sets: 3 },
        ],
      },
    });
    expect(out).toEqual({
      workout_type: 'AMRAP',
      duration_min: 32,
      exercises: [
        {
          name: 'Push-up',
          sets: 4,
          reps: '10',
          coach_notes: 'control descent',
          equipment: 'bands',
        },
      ],
    });
  });

  it('passes through blocks with block_format and drops invalid empty blocks', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        workout_type: 'AMRAP',
        duration_min: 45,
        exercises: [{ name: 'Goblet Squat' }, { name: 'Push Press' }],
        blocks: [
          {
            name: 'Finisher',
            block_format: 'amrap',
            format_params: { time_cap_minutes: 12 },
            exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: 12 }],
          },
          {},
          { name: '', exercises: [] },
        ],
      },
    });
    expect(meta.exercises).toEqual([{ name: 'Goblet Squat' }, { name: 'Push Press' }]);
    expect(meta.blocks).toEqual([
      {
        name: 'Finisher',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 12 },
        exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: 12 }],
      },
    ]);
    expect(drops).toEqual([]);
  });

  it('drops legacy AMRAP block without time_cap_minutes', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            type: 'AMRAP',
            rounds: 3,
            exercises: [{ name: 'Burpees' }],
          },
        ],
      },
    });
    expect(meta.blocks).toBeUndefined();
    expect(drops).toEqual([{ field: 'blocks[0]', reason: 'amrap_missing_time_cap' }]);
  });

  it('passes EMOM with valid format_params', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: { interval_seconds: 60, total_minutes: 16 },
            exercises: [{ name: 'Kettlebell Swing', reps: '12' }],
          },
        ],
      },
    });
    expect(meta.blocks).toEqual([
      {
        name: 'Main',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 16 },
        exercises: [{ name: 'Kettlebell Swing', reps: '12' }],
      },
    ]);
  });

  it('drops EMOM missing interval_seconds', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: { total_minutes: 16 },
            exercises: [{ name: 'Push-up' }],
          },
        ],
      },
    });
    expect(meta.blocks).toBeUndefined();
    expect(drops).toEqual([{ field: 'blocks[0]', reason: 'emom_missing_params' }]);
  });

  it('hydrates combo alternating EMOM when is_combo true and stations omitted', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: {
              interval_seconds: 60,
              total_minutes: 12,
              is_alternating: true,
              is_combo: true,
            },
            exercises: [
              { name: 'Back Squat', reps: '5' },
              { name: 'Push-up', reps: '10' },
              { name: 'Sit-up', reps: '15' },
            ],
          },
        ],
      },
    });
    expect(drops).toEqual([]);
    expect(meta.blocks).toEqual([
      {
        name: 'Main',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 12,
          is_alternating: true,
          alternating_stations: [[0], [1, 2]],
        },
        exercises: [
          { name: 'Back Squat', reps: '5' },
          { name: 'Push-up', reps: '10' },
          { name: 'Sit-up', reps: '15' },
        ],
      },
    ]);
  });

  it('hydrates alternating EMOM matrix when is_alternating true and stations omitted', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: {
              interval_seconds: 60,
              total_minutes: 12,
              is_alternating: true,
            },
            exercises: [
              { name: 'Deadlift', reps: '5' },
              { name: 'Push-up', reps: '10' },
              { name: 'Air Squat', reps: '15' },
            ],
          },
        ],
      },
    });
    expect(drops).toEqual([]);
    expect(meta.blocks).toEqual([
      {
        name: 'Main',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 12,
          is_alternating: true,
          alternating_stations: [[0], [1], [2]],
        },
        exercises: [
          { name: 'Deadlift', reps: '5' },
          { name: 'Push-up', reps: '10' },
          { name: 'Air Squat', reps: '15' },
        ],
      },
    ]);
  });

  it('passes alternating EMOM with valid alternating_stations', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: {
              interval_seconds: 60,
              total_minutes: 12,
              is_alternating: true,
              alternating_stations: [[0], [1, 2]],
            },
            exercises: [
              { name: 'Deadlift', reps: '5' },
              { name: 'Push-up', reps: '10' },
              { name: 'Air Squat', reps: '15' },
            ],
          },
        ],
      },
    });
    expect(drops).toEqual([]);
    expect(meta.blocks).toEqual([
      {
        name: 'Main',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 12,
          is_alternating: true,
          alternating_stations: [[0], [1, 2]],
        },
        exercises: [
          { name: 'Deadlift', reps: '5' },
          { name: 'Push-up', reps: '10' },
          { name: 'Air Squat', reps: '15' },
        ],
      },
    ]);
  });

  it('drops alternating EMOM when stations are invalid', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: {
              interval_seconds: 60,
              total_minutes: 12,
              is_alternating: true,
              alternating_stations: [[0], [3]],
            },
            exercises: [
              { name: 'Deadlift', reps: '5' },
              { name: 'Push-up', reps: '10' },
              { name: 'Air Squat', reps: '15' },
            ],
          },
        ],
      },
    });
    expect(meta.blocks).toBeUndefined();
    expect(drops).toEqual([{ field: 'blocks[0]', reason: 'emom_alternating_invalid_stations' }]);
  });

  it('validates superset cardinality', () => {
    const pass = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Strength A',
            block_format: 'superset',
            format_params: { rounds: 4 },
            exercises: [{ name: 'Bench' }, { name: 'Row' }],
          },
        ],
      },
    });
    expect((pass.meta.blocks as Record<string, unknown>[])[0]).toMatchObject({
      block_format: 'superset',
    });

    const fail = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Strength A',
            block_format: 'superset',
            format_params: { rounds: 4 },
            exercises: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
          },
        ],
      },
    });
    expect(fail.meta.blocks).toBeUndefined();
    expect(fail.drops[0]?.reason).toBe('superset_cardinality');
  });

  it('validates circuit cardinality', () => {
    const fail = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Circuit',
            block_format: 'circuit',
            format_params: { rounds: 3 },
            exercises: [{ name: 'A' }, { name: 'B' }],
          },
        ],
      },
    });
    expect(fail.drops[0]?.reason).toBe('circuit_cardinality');

    const pass = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Circuit',
            block_format: 'circuit',
            format_params: { rounds: 3 },
            exercises: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
          },
        ],
      },
    });
    expect(pass.meta.blocks).toHaveLength(1);
  });

  it('drops tabata without rounds', () => {
    const { drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'tabata',
            exercises: [{ name: 'Mountain Climbers' }],
          },
        ],
      },
    });
    expect(drops[0]?.reason).toBe('tabata_missing_rounds');
  });

  it('passes ladder with start_reps and peak_reps', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'ladder',
            format_params: { start_reps: 1, peak_reps: 10, step_reps: 1, direction: 'ascending' },
            exercises: [{ name: 'Pull-ups' }],
          },
        ],
      },
    });
    expect(drops).toHaveLength(0);
    const block = (meta.blocks as Record<string, unknown>[])[0];
    expect(block.block_format).toBe('ladder');
    expect(block.format_params).toMatchObject({ start_reps: 1, peak_reps: 10 });
  });

  it('passes chipper with rounds and 3+ exercises', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'chipper',
            format_params: { rounds: 1, time_cap_minutes: 15 },
            exercises: [{ name: 'Burpees' }, { name: 'Kettlebell Swings' }, { name: 'Box Jumps' }],
          },
        ],
      },
    });
    expect(drops).toHaveLength(0);
    const block = (meta.blocks as Record<string, unknown>[])[0];
    expect(block.block_format).toBe('chipper');
  });

  it('drops chipper with fewer than 3 exercises', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'chipper',
            format_params: { rounds: 1 },
            exercises: [{ name: 'Burpees' }, { name: 'Push-ups' }],
          },
        ],
      },
    });
    expect(meta.blocks).toBeUndefined();
    expect(drops).toEqual([{ field: 'blocks[0]', reason: 'chipper_cardinality' }]);
  });

  it('passes pyramid with start_reps and peak_reps', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'pyramid',
            format_params: { start_reps: 6, peak_reps: 12, direction: 'ascending' },
            exercises: [{ name: 'Bench Press' }],
          },
        ],
      },
    });
    expect(drops).toHaveLength(0);
    const block = (meta.blocks as Record<string, unknown>[])[0];
    expect(block.block_format).toBe('pyramid');
    expect(block.format_params).toMatchObject({ start_reps: 6, peak_reps: 12 });
  });

  it('drops pyramid without start_reps and peak_reps', () => {
    const { drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'pyramid',
            format_params: { start_reps: 6 },
            exercises: [{ name: 'Bench Press' }],
          },
        ],
      },
    });
    expect(drops[0]?.reason).toBe('pyramid_missing_reps');
  });

  it('passes contrast with exactly 2 exercises', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'contrast',
            format_params: { rounds: 4 },
            exercises: [{ name: 'Back Squat' }, { name: 'Box Jump' }],
          },
        ],
      },
    });
    expect(drops).toHaveLength(0);
    expect((meta.blocks as Record<string, unknown>[])[0].block_format).toBe('contrast');
  });

  it('drops contrast with wrong exercise count', () => {
    const { drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'contrast',
            format_params: { rounds: 4 },
            exercises: [{ name: 'Back Squat' }],
          },
        ],
      },
    });
    expect(drops[0]?.reason).toBe('contrast_cardinality');
  });

  it('drops contrast without rounds', () => {
    const { drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'contrast',
            format_params: {},
            exercises: [{ name: 'Back Squat' }, { name: 'Box Jump' }],
          },
        ],
      },
    });
    expect(drops[0]?.reason).toBe('contrast_missing_rounds');
  });

  it('passes clusters with reps_per_cluster and clusters', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Strength',
            block_format: 'clusters',
            format_params: { reps_per_cluster: 3, clusters: 4 },
            exercises: [{ name: 'Deadlift' }],
          },
        ],
      },
    });
    expect(drops).toHaveLength(0);
    expect((meta.blocks as Record<string, unknown>[])[0].block_format).toBe('clusters');
  });

  it('drops clusters without required params', () => {
    const { drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Strength',
            block_format: 'clusters',
            format_params: { reps_per_cluster: 3 },
            exercises: [{ name: 'Deadlift' }],
          },
        ],
      },
    });
    expect(drops[0]?.reason).toBe('clusters_missing_params');
  });

  it('passes drop_sets with drop_percent and drops', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Strength',
            block_format: 'drop_sets',
            format_params: { drop_percent: 20, drops: 2 },
            exercises: [{ name: 'Leg Press' }],
          },
        ],
      },
    });
    expect(drops).toHaveLength(0);
    expect((meta.blocks as Record<string, unknown>[])[0].block_format).toBe('drop_sets');
  });

  it('drops drop_sets without drop_percent and drops', () => {
    const { drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Strength',
            block_format: 'drop_sets',
            format_params: { drop_percent: 20 },
            exercises: [{ name: 'Leg Press' }],
          },
        ],
      },
    });
    expect(drops[0]?.reason).toBe('drop_sets_missing_params');
  });

  it('drops unknown block_format without coercing to straight_sets', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Main',
            block_format: 'mystery',
            exercises: [{ name: 'Squat' }],
          },
        ],
      },
    });
    expect(meta.blocks).toBeUndefined();
    expect(drops).toEqual([{ field: 'blocks[0]', reason: 'unknown_block_format' }]);
  });

  it('maps legacy type AMRAP with time_cap_minutes', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            type: 'AMRAP',
            format_params: { time_cap_minutes: 12 },
            exercises: [{ name: 'Burpees' }],
          },
        ],
      },
    });
    const block = (meta.blocks as Record<string, unknown>[])[0];
    expect(block.block_format).toBe('amrap');
    expect(block).not.toHaveProperty('type');
  });

  it('defaults missing format to straight_sets for exercise-shaped blocks', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [{ name: 'Main', exercises: [{ name: 'Squat', sets: 3, reps: '10' }] }],
      },
    });
    expect((meta.blocks as Record<string, unknown>[])[0].block_format).toBe('straight_sets');
  });

  it('exempts instruction-only blocks from block_format', () => {
    const { meta, drops } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Cool down',
            instructions: ['Walk 2 min easy'],
          },
        ],
      },
    });
    const block = (meta.blocks as Record<string, unknown>[])[0];
    expect(block.instructions).toEqual(['Walk 2 min easy']);
    expect(block).not.toHaveProperty('block_format');
    expect(block).not.toHaveProperty('format_params');
    expect(drops).toEqual([]);
  });

  it('returns only blocks when top-level exercises are empty or invalid', () => {
    const out = parseProposedWorkoutMetadata({
      proposed_workout_metadata: {
        blocks: [{ name: 'Warmup', exercises: [{ name: 'Jump Rope' }] }],
      },
    });
    expect(out).toEqual({
      blocks: [
        {
          name: 'Warmup',
          block_format: 'straight_sets',
          exercises: [{ name: 'Jump Rope' }],
        },
      ],
    });
  });

  it('passes through blocks with instructions[] string lines', () => {
    const out = parseProposedWorkoutMetadata({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Cool down',
            instructions: ['Walk 2 min easy', 'Diaphragmatic breathing 1 min'],
          },
        ],
      },
    });
    expect(out.blocks).toEqual([
      {
        name: 'Cool down',
        instructions: ['Walk 2 min easy', 'Diaphragmatic breathing 1 min'],
      },
    ]);
    const blocks = out.blocks as Array<Record<string, unknown>>;
    expect(blocks[0]).not.toHaveProperty('exercises');
  });

  it('passes through work_seconds and rest_seconds on top-level exercises', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        exercises: [{ name: 'Burpees', work_seconds: 20, rest_seconds: 10 }],
      },
    });
    expect(meta.exercises).toEqual([{ name: 'Burpees', work_seconds: 20, rest_seconds: 10 }]);
  });

  it('passes through work_seconds and rest_seconds on block exercises', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'tabata',
            format_params: { rounds: 8 },
            exercises: [{ name: 'Thrusters', work_seconds: 20, rest_seconds: 10 }],
          },
        ],
      },
    });
    const block = (meta.blocks as Record<string, unknown>[])[0];
    expect((block.exercises as Record<string, unknown>[])[0]).toEqual({
      name: 'Thrusters',
      work_seconds: 20,
      rest_seconds: 10,
    });
  });

  it('preserves rest_seconds: 0', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        exercises: [{ name: 'Row', rest_seconds: 0 }],
      },
    });
    expect((meta.exercises as Record<string, unknown>[])[0].rest_seconds).toBe(0);
  });

  it('drops negative work_seconds', () => {
    const { meta } = parseProposedWorkoutMetadataWithDrops({
      proposed_workout_metadata: {
        exercises: [{ name: 'Row', work_seconds: -5, rest_seconds: 10 }],
      },
    });
    const ex = (meta.exercises as Record<string, unknown>[])[0];
    expect(ex).not.toHaveProperty('work_seconds');
    expect(ex.rest_seconds).toBe(10);
  });
});

describe('ensureCoachTaskNotesCta', () => {
  it('returns null on null', () => {
    expect(ensureCoachTaskNotesCta(null)).toBeNull();
  });

  it('preserves notes that already include both keywords', () => {
    const notes =
      "Solid plan. Complete the Workout Intake 3-step form then click 'Generate Workout' on the card.";
    expect(ensureCoachTaskNotesCta(notes)).toBe(notes);
  });

  it('appends the verbatim CTA when keywords are missing', () => {
    expect(ensureCoachTaskNotesCta('Quick rationale.')).toBe(
      `Quick rationale.\n\n${COACH_TASK_SEED_CTA}`,
    );
  });

  it('truncates the combined body to fit the Postgres cap', () => {
    const big = 'a'.repeat(COACH_TASK_NOTES_MAX_CHARS);
    const result = ensureCoachTaskNotesCta(big);
    expect(result).toBeDefined();
    expect(result!.length).toBe(COACH_TASK_NOTES_MAX_CHARS);
    expect(result!.endsWith('...')).toBe(true);
  });
});

describe('parseExecutionPatchFromGemini', () => {
  it('rejects negative or non-integer indices by returning null for the entire patch', () => {
    expect(parseExecutionPatchFromGemini([{ exerciseIndex: -1, setIndex: 0 }])).toBeNull();
    expect(parseExecutionPatchFromGemini([{ exerciseIndex: 1.5, setIndex: 0 }])).toBeNull();
    expect(parseExecutionPatchFromGemini([{ exerciseIndex: 0, setIndex: -2 }])).toBeNull();
  });

  it('sanitizes weight strings by extracting the numeric prefix', () => {
    const out = parseExecutionPatchFromGemini([
      { exerciseIndex: 0, setIndex: 0, weight: '135 lbs' },
    ]);
    expect(out).toEqual([{ exerciseIndex: 0, setIndex: 0, weight: '135' }]);
  });

  it('drops the offending field but preserves the patch when sanitization fails', () => {
    const out = parseExecutionPatchFromGemini([
      { exerciseIndex: 0, setIndex: 1, reps: 'as many as possible' },
    ]);
    expect(out).toEqual([{ exerciseIndex: 0, setIndex: 1 }]);
  });

  it('coerces numeric weight, reps, and rpe from JSON numbers', () => {
    const out = parseExecutionPatchFromGemini([
      { exerciseIndex: 1, setIndex: 2, weight: 135, reps: 8, rpe: 7.5 },
    ]);
    expect(out).toEqual([{ exerciseIndex: 1, setIndex: 2, weight: '135', reps: '8', rpe: '7.5' }]);
  });

  it('omits done when not a real boolean but preserves the patch', () => {
    expect(
      parseExecutionPatchFromGemini([{ exerciseIndex: 0, setIndex: 0, done: 'true' }]),
    ).toEqual([{ exerciseIndex: 0, setIndex: 0 }]);
  });

  it('returns null on empty input or bad shape', () => {
    expect(parseExecutionPatchFromGemini(null)).toBeNull();
    expect(parseExecutionPatchFromGemini([])).toBeNull();
    expect(parseExecutionPatchFromGemini('not an array')).toBeNull();
  });
});

describe('parseIntakePhase', () => {
  it('passes through allowed values', () => {
    expect(parseIntakePhase('clarifying_session')).toBe('clarifying_session');
    expect(parseIntakePhase('ready_to_prescribe')).toBe('ready_to_prescribe');
  });

  it('falls back to other on unknown values or wrong types', () => {
    expect(parseIntakePhase('not-a-phase')).toBe('other');
    expect(parseIntakePhase(123)).toBe('other');
    expect(parseIntakePhase(null)).toBe('other');
  });
});

describe('parseSessionReadinessScore', () => {
  it('clamps to [0, 100] and rounds', () => {
    expect(parseSessionReadinessScore(50.6)).toBe(51);
    expect(parseSessionReadinessScore(150)).toBe(100);
    expect(parseSessionReadinessScore(-25)).toBe(0);
  });

  it('returns 0 on non-finite input', () => {
    expect(parseSessionReadinessScore(Number.NaN)).toBe(0);
    expect(parseSessionReadinessScore('80')).toBe(0);
    expect(parseSessionReadinessScore(undefined)).toBe(0);
  });
});

describe('parseMissingIntakeCategories', () => {
  it('filters to allowed enum values', () => {
    expect(parseMissingIntakeCategories(['sleep_energy', 'unknown', 'soreness', 42])).toEqual([
      'sleep_energy',
      'soreness',
    ]);
  });

  it('returns empty array when input is not an array', () => {
    expect(parseMissingIntakeCategories(null)).toEqual([]);
    expect(parseMissingIntakeCategories('sleep_energy')).toEqual([]);
  });
});

describe('stripMarkdownCodeFences', () => {
  it('strips a full ```json fence', () => {
    expect(stripMarkdownCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a leading-only fence', () => {
    expect(stripMarkdownCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it('strips a generic ``` fence', () => {
    expect(stripMarkdownCodeFences('```\nplain body\n```')).toBe('plain body');
  });

  it('passes through bodies without fences', () => {
    expect(stripMarkdownCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

const DICT_0 = { dictionary_id: '11111111-1111-4111-8111-111111111111', slug: 'deadlift' as const };

describe('parsePersonalCuesPatchFromGemini', () => {
  const byIndex = { 0: DICT_0, 1: null } as const;

  it('maps valid patch entries to RPC rows', () => {
    const raw = [
      {
        exerciseIndex: 0,
        form_cues: '  brace hard  ',
        tips: 'reset between reps',
        mode: 'append',
      },
    ];
    const out = parsePersonalCuesPatchFromGemini(raw, byIndex);
    expect(out.droppedUnanchored).toBe(0);
    expect(out.entries).toEqual([
      {
        exercise_dictionary_id: DICT_0.dictionary_id,
        mode: 'append',
        form_cues: 'brace hard',
        tips: 'reset between reps',
      },
    ]);
  });

  it('defaults mode to append when omitted or unknown', () => {
    const raw = [{ exerciseIndex: 0, instructions: 'x' }];
    expect(parsePersonalCuesPatchFromGemini(raw, byIndex).entries[0]?.mode).toBe('append');
    expect(
      parsePersonalCuesPatchFromGemini(
        [{ exerciseIndex: 0, instructions: 'x', mode: 'nope' }],
        byIndex,
      ).entries[0]?.mode,
    ).toBe('append');
  });

  it('uses replace mode when explicitly requested', () => {
    const raw = [{ exerciseIndex: 0, instructions: 'new', mode: 'REPLACE' }];
    expect(parsePersonalCuesPatchFromGemini(raw, byIndex).entries[0]?.mode).toBe('replace');
  });

  it('drops unanchored indices and increments counter', () => {
    const raw = [{ exerciseIndex: 1, form_cues: 'should not persist' }];
    const out = parsePersonalCuesPatchFromGemini(raw, byIndex);
    expect(out.entries).toEqual([]);
    expect(out.droppedUnanchored).toBe(1);
  });

  it('drops all entries when dictionary map is missing', () => {
    const raw = [{ exerciseIndex: 0, form_cues: 'x' }];
    const out = parsePersonalCuesPatchFromGemini(raw, undefined);
    expect(out.entries).toEqual([]);
    expect(out.droppedUnanchored).toBe(1);
  });

  it('caps long text fields', () => {
    const long = 'a'.repeat(PERSONAL_CUES_FIELD_MAX_CHARS + 50);
    const out = parsePersonalCuesPatchFromGemini([{ exerciseIndex: 0, tips: long }], byIndex);
    expect(out.entries[0]?.tips?.length).toBe(PERSONAL_CUES_FIELD_MAX_CHARS);
    expect(out.entries[0]?.tips?.endsWith('...')).toBe(true);
  });

  it('skips entries with no text fields after trim', () => {
    const out = parsePersonalCuesPatchFromGemini([{ exerciseIndex: 0, form_cues: '   ' }], byIndex);
    expect(out.entries).toEqual([]);
  });
});

describe('parseCoachJson', () => {
  it('throws gemini_invalid_json_shape when create_card true but task_title is empty', () => {
    const text = JSON.stringify(
      makeReplyOnlyPayload({
        reply_content: 'sure',
        create_card: true,
        task_title: '',
        task_description: 'body',
      }),
    );
    expect(() => parseCoachJson(text)).toThrowError('gemini_invalid_json_shape');
  });

  it('populates proposedMetaOrNull when create_card is false', () => {
    const text = JSON.stringify(
      makeReplyOnlyPayload({
        proposed_workout_metadata: {
          workout_type: 'EMOM',
          exercises: [{ name: 'Burpee', sets: 3 }],
        },
        update_existing_task: true,
      }),
    );
    const out = parseCoachJson(text);
    expect(out.create_card).toBe(false);
    expect(out.proposed_workout_metadata).toEqual({
      workout_type: 'EMOM',
      exercises: [{ name: 'Burpee', sets: 3 }],
    });
  });

  it('throws gemini_json_parse_failed when the body is not JSON', () => {
    expect(() => parseCoachJson('not json at all')).toThrowError('gemini_json_parse_failed');
  });

  it('throws gemini_invalid_json_shape when reply_content is missing or empty', () => {
    expect(() =>
      parseCoachJson(
        JSON.stringify({
          reply_content: '   ',
          create_card: false,
          task_title: null,
          task_description: null,
          ...REQUIRED_TAIL,
        }),
      ),
    ).toThrowError('gemini_invalid_json_shape');
  });

  it('strips a wrapping ```json code fence before parsing', () => {
    const body = makeReplyOnlyPayload({ reply_content: 'wrapped ok' });
    const text = '```json\n' + JSON.stringify(body) + '\n```';
    expect(parseCoachJson(text).reply_content).toBe('wrapped ok');
  });

  it('resolves personal_cues_patch when exercise dictionary map is provided', () => {
    const body = makeReplyOnlyPayload({
      personal_cues_patch: [{ exerciseIndex: 0, form_cues: 'hips high' }],
    });
    const dict = { 0: DICT_0 };
    const out = parseCoachJson(JSON.stringify(body), dict);
    expect(out.personal_cues_resolved).toEqual([
      {
        exercise_dictionary_id: DICT_0.dictionary_id,
        mode: 'append',
        form_cues: 'hips high',
      },
    ]);
    expect(out.personal_cues_dropped_unanchored).toBe(0);
  });

  it('returns empty task_modal_intake_dropped when intake patch is absent', () => {
    const out = parseCoachJson(JSON.stringify(makeReplyOnlyPayload()));
    expect(out.task_modal_intake_dropped).toEqual([]);
    expect(out.proposed_workout_metadata_drops).toEqual([]);
  });

  it('surfaces proposed_workout_metadata_drops when blocks fail validation', () => {
    const out = parseCoachJson(
      JSON.stringify(
        makeReplyOnlyPayload({
          proposed_workout_metadata: {
            blocks: [
              {
                name: 'Main',
                block_format: 'emom',
                format_params: { total_minutes: 10 },
                exercises: [{ name: 'Swing' }],
              },
            ],
          },
        }),
      ),
    );
    expect(out.proposed_workout_metadata_drops).toEqual([
      { field: 'blocks[0]', reason: 'emom_missing_params' },
    ]);
    expect(out.proposed_workout_metadata).toBeNull();
  });

  it('round-trips card_action trigger_generation on no-card branch', () => {
    const out = parseCoachJson(
      JSON.stringify(
        makeReplyOnlyPayload({
          card_action: 'trigger_generation',
          reply_content: 'Starting the generator now.',
        }),
      ),
    );
    expect(out.card_action).toBe('trigger_generation');
  });

  it('accepts card_action as object { kind: trigger_generation }', () => {
    const out = parseCoachJson(
      JSON.stringify(
        makeReplyOnlyPayload({
          card_action: { kind: 'trigger_generation' },
          reply_content: 'Starting the generator now.',
        }),
      ),
    );
    expect(out.card_action).toBe('trigger_generation');
  });

  it('accepts card_action as object { v: 1, kind: trigger_generation }', () => {
    const out = parseCoachJson(
      JSON.stringify(
        makeReplyOnlyPayload({
          card_action: { v: 1, kind: 'trigger_generation' },
          reply_content: 'Starting the generator now.',
        }),
      ),
    );
    expect(out.card_action).toBe('trigger_generation');
  });

  it('trims whitespace on string card_action trigger_generation', () => {
    const out = parseCoachJson(
      JSON.stringify(
        makeReplyOnlyPayload({
          card_action: '  trigger_generation ',
          reply_content: 'Go.',
        }),
      ),
    );
    expect(out.card_action).toBe('trigger_generation');
  });

  it('maps unknown card_action strings to null', () => {
    const out = parseCoachJson(
      JSON.stringify(makeReplyOnlyPayload({ card_action: 'reset_intake' })),
    );
    expect(out.card_action).toBeNull();
  });

  it('defaults missing card_action to null', () => {
    const out = parseCoachJson(JSON.stringify(makeReplyOnlyPayload()));
    expect(out.card_action).toBeNull();
  });

  it('parseCoachWorkoutOutlineWithDrops keeps EMOM alternating block', () => {
    const { outline, drops } = parseCoachWorkoutOutlineWithDrops({
      coach_workout_outline: [
        {
          name: 'Main',
          block_format: 'emom',
          format_params: {
            interval_seconds: 60,
            total_minutes: 12,
            is_alternating: true,
          },
          exercises: [
            { name: 'KB Swing', sets: 1, reps: '10' },
            { name: 'Push-up', sets: 1, reps: '12' },
          ],
        },
      ],
    });
    expect(drops).toEqual([]);
    expect(outline).toHaveLength(1);
    expect(outline![0].block_format).toBe('emom');
    const fp = outline![0].format_params as Record<string, unknown>;
    expect(fp.is_alternating).toBe(true);
    expect(fp.alternating_stations).toEqual([[0], [1]]);
  });

  it('parseCoachWorkoutOutlineWithDrops drops invalid block shape', () => {
    const { outline, drops } = parseCoachWorkoutOutlineWithDrops({
      coach_workout_outline: [
        {
          name: 'Main',
          block_format: 'emom',
          format_params: { total_minutes: 10 },
          exercises: [{ name: 'Swing' }],
        },
      ],
    });
    expect(outline).toBeNull();
    expect(drops).toEqual([{ field: 'coach_workout_outline[0]', reason: 'emom_missing_params' }]);
  });

  it('parseCoachWorkoutOutlineWithDrops returns null for empty array', () => {
    const { outline, drops } = parseCoachWorkoutOutlineWithDrops({ coach_workout_outline: [] });
    expect(outline).toBeNull();
    expect(drops).toEqual([]);
  });

  it('parseCoachWorkoutOutlineWithDrops pads circuit Phase B placeholder to three exercises', () => {
    const { outline, drops } = parseCoachWorkoutOutlineWithDrops({
      coach_workout_outline: [
        {
          name: 'Main Circuit',
          block_format: 'circuit',
          format_params: { rounds: 3 },
          exercises: [{ name: 'Goblet Squat' }],
        },
      ],
    });
    expect(drops).toEqual([]);
    expect(outline).toHaveLength(1);
    expect(outline![0].exercises).toHaveLength(3);
  });

  it('parseCoachOutlineOnlyBlocksFromText reads Phase B blocks wrapper', () => {
    const { outline, drops } = parseCoachOutlineOnlyBlocksFromText(
      JSON.stringify({
        blocks: [
          {
            name: 'Main',
            block_format: 'tabata',
            format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
            exercises: [{ name: 'Burpee' }],
          },
        ],
      }),
    );
    expect(drops).toEqual([]);
    expect(outline).toHaveLength(1);
    expect(outline![0].block_format).toBe('tabata');
  });

  it('parseCoachJson surfaces coach_workout_outline on create_card branch', () => {
    const out = parseCoachJson(
      JSON.stringify({
        reply_content: 'Card ready',
        create_card: true,
        task_title: 'EMOM',
        task_description: 'Summary',
        coach_task_notes: null,
        coach_workout_outline: [
          {
            name: 'Main',
            block_format: 'tabata',
            format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
            exercises: [{ name: 'Burpee' }],
          },
        ],
        ...REQUIRED_TAIL,
        intake_phase: 'ready_to_prescribe',
        session_readiness_score: 80,
        missing_intake_categories: [],
        user_requested_immediate_card: true,
        session_request: true,
      }),
    );
    expect(out.create_card).toBe(true);
    expect(out.coach_workout_outline).toHaveLength(1);
    expect(out.coach_workout_outline![0].block_format).toBe('tabata');
  });

  it('forces card_action null on create_card branch', () => {
    const out = parseCoachJson(
      JSON.stringify({
        reply_content: 'New card',
        create_card: true,
        task_title: 'Workout',
        task_description: null,
        card_action: 'trigger_generation',
        ...REQUIRED_TAIL,
        intake_phase: 'other',
        session_readiness_score: 50,
        missing_intake_categories: [],
        user_requested_immediate_card: false,
        session_request: false,
        coach_task_notes: null,
      }),
    );
    expect(out.create_card).toBe(true);
    expect(out.card_action).toBeNull();
  });

  it('surfaces task_modal_intake_dropped for unknown keys and readiness clamp', () => {
    const out = parseCoachJson(
      JSON.stringify(
        makeReplyOnlyPayload({
          task_modal_intake_patch: { foo: 1, readiness: 95, sleep_quality: 4 },
        }),
      ),
    );
    expect(out.task_modal_intake_patch).toEqual({ readiness: 10, sleep_quality: 4 });
    expect(out.task_modal_intake_dropped.some((d) => d.reason === 'unknown_key')).toBe(true);
    expect(out.task_modal_intake_dropped.some((d) => d.reason === 'clamped')).toBe(true);
  });
});

describe('parseOutlineDraftPatchFromGemini', () => {
  it('parses valid outline_draft_patch', () => {
    const { patch, drops } = parseOutlineDraftPatchFromGemini({
      revision: 2,
      mode: 'merge_by_name',
      blocks: [{ name: 'Main', block_format: 'amrap', format_params: { time_cap_minutes: 10 } }],
    });
    expect(patch?.revision).toBe(2);
    expect(patch?.mode).toBe('merge_by_name');
    expect(patch?.blocks[0]?.name).toBe('Main');
    expect(drops).toEqual([]);
  });

  it('returns null when revision missing', () => {
    const { patch } = parseOutlineDraftPatchFromGemini({
      blocks: [{ name: 'X' }],
    });
    expect(patch).toBeNull();
  });

  it('drops verbose block names and preserves routing in exercises/format_params', () => {
    const { patch, drops } = parseOutlineDraftPatchFromGemini({
      revision: 1,
      mode: 'merge_by_name',
      blocks: [
        {
          name: 'Main Circuit 1 (AMRAP 15 min.) - 4 Exercises Each Block',
          block_format: 'amrap',
          format_params: { time_cap_minutes: 15 },
        },
        {
          name: 'Main AMRAP',
          block_format: 'amrap',
          format_params: { time_cap_minutes: 15 },
          exercises: [
            { name: 'Station 1' },
            { name: 'Station 2' },
            { name: 'Station 3' },
            { name: 'Station 4' },
          ],
        },
      ],
    });
    expect(patch?.blocks).toHaveLength(1);
    expect(patch?.blocks[0]?.name).toBe('Main AMRAP');
    expect((patch?.blocks[0]?.exercises as { name: string }[] | undefined)?.length).toBe(4);
    expect(drops.some((d) => d.reason === 'block_name_too_verbose')).toBe(true);
  });
});
