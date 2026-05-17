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
  parseProposedWorkoutMetadata,
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

  it('passes through blocks with nested exercises and drops empty blocks', () => {
    const out = parseProposedWorkoutMetadata({
      proposed_workout_metadata: {
        workout_type: 'AMRAP',
        duration_min: 45,
        exercises: [{ name: 'Goblet Squat' }, { name: 'Push Press' }],
        blocks: [
          {
            name: 'Finisher',
            type: 'AMRAP',
            rounds: 3,
            exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: 12 }],
          },
          {},
          { name: '', exercises: [] },
        ],
      },
    });
    expect(out.exercises).toEqual([{ name: 'Goblet Squat' }, { name: 'Push Press' }]);
    expect(out.blocks).toEqual([
      {
        name: 'Finisher',
        type: 'AMRAP',
        rounds: 3,
        exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: 12 }],
      },
    ]);
  });

  it('returns only blocks when top-level exercises are empty or invalid', () => {
    const out = parseProposedWorkoutMetadata({
      proposed_workout_metadata: {
        blocks: [{ name: 'Warmup', exercises: [{ name: 'Jump Rope' }] }],
      },
    });
    expect(out).toEqual({
      blocks: [{ name: 'Warmup', exercises: [{ name: 'Jump Rope' }] }],
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
});

describe('ensureCoachTaskNotesCta', () => {
  it('returns null on null', () => {
    expect(ensureCoachTaskNotesCta(null)).toBeNull();
  });

  it('preserves notes that already include both keywords', () => {
    const notes = 'Solid plan. Generate Workout once you have made any adjustments.';
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
