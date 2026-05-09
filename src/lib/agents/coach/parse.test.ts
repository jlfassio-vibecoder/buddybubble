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

import { COACH_TASK_NOTES_MAX_CHARS, COACH_TASK_SEED_CTA } from './config';
import {
  coalesceTaskDescription,
  coalesceUpdatedTaskDescription,
  ensureCoachTaskNotesCta,
  parseCoachJson,
  parseExecutionPatchFromGemini,
  parseIntakePhase,
  parseMissingIntakeCategories,
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
});
