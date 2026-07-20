import { describe, it, expect } from 'vitest';
import {
  computeEmptyCueFields,
  messageRequestsCoachNotes,
  parseExerciseCueRequestFromMetadata,
  readInjuriesOnFileFromBiometrics,
  resolveExerciseCueRequestForDispatch,
  structuralPatchIsEmptyCoachNotesClaim,
} from '@/lib/agents/coach/exercise-cue-request';
import { buildExerciseCueRequestCoachBlock } from '@/lib/agents/coach/prompts';
import { emptyResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';

describe('exercise-cue-request', () => {
  it('parseExerciseCueRequestFromMetadata round-trips', () => {
    const req = {
      v: 1,
      resolution_key: 'squat::0',
      exercise_name: 'Goblet Squat',
      empty_fields: ['instructions', 'form_cues'],
      prescription: { sets: 3, reps: '10' },
      workout_exercise_index: 2,
    };
    expect(parseExerciseCueRequestFromMetadata(req)).toEqual(req);
  });

  it('computeEmptyCueFields gates injury field on profile', () => {
    const bundle = emptyResolvedCueBundle('Squat');
    expect(computeEmptyCueFields(bundle, { includeInjuryField: false })).toEqual([
      'instructions',
      'form_cues',
      'tips',
    ]);
    expect(computeEmptyCueFields(bundle, { includeInjuryField: true })).toEqual([
      'instructions',
      'form_cues',
      'tips',
      'injury_prevention_tips',
    ]);
  });

  it('computeEmptyCueFields treats personal-only values as empty for Ask Coach', () => {
    expect(
      computeEmptyCueFields(
        {
          instructions: { value: 'Personal steps', provenance: 'personal' },
          form_cues: { value: 'Knees out', provenance: 'personal' },
          tips: null,
          injury_prevention_tips: null,
        },
        { includeInjuryField: false },
      ),
    ).toEqual(['instructions', 'form_cues', 'tips']);
  });

  it('computeEmptyCueFields omits workout-scoped filled fields', () => {
    expect(
      computeEmptyCueFields(
        {
          instructions: { value: 'Card steps', provenance: 'workout' },
          form_cues: { value: 'Flat cue', provenance: 'flat' },
          tips: null,
          injury_prevention_tips: { value: 'Library tip', provenance: 'library' },
        },
        { includeInjuryField: true },
      ),
    ).toEqual(['tips', 'injury_prevention_tips']);
  });

  it('readInjuriesOnFileFromBiometrics', () => {
    expect(readInjuriesOnFileFromBiometrics({ injuries: ' knee pain ' })).toEqual({
      onFile: true,
      snippet: 'knee pain',
    });
    expect(readInjuriesOnFileFromBiometrics({ injuries: '' }).onFile).toBe(false);
  });

  it('buildExerciseCueRequestCoachBlock mentions injuries when on file', () => {
    const block = buildExerciseCueRequestCoachBlock(
      {
        v: 1,
        resolution_key: 'squat::0',
        exercise_name: 'Goblet Squat',
        empty_fields: ['instructions', 'injury_prevention_tips'],
        prescription: { sets: 3, reps: 10 },
      },
      { onFile: true, snippet: 'knee pain' },
    );
    expect(block).toContain('injuries_on_file: true');
    expect(block).toContain('injury_snippet: knee pain');
    expect(block).toContain('Injury notes');
  });

  it('resolveExerciseCueRequestForDispatch falls back to history on affirmation turn', () => {
    const req = {
      v: 1 as const,
      resolution_key: 'squat::0',
      exercise_name: 'Goblet Squat',
      empty_fields: ['form_cues' as const],
    };
    const resolved = resolveExerciseCueRequestForDispatch(
      {},
      [
        {
          user_id: 'user-1',
          metadata: { exercise_cue_request: req },
        },
      ],
      'agent-1',
    );
    expect(resolved).toEqual(req);
  });

  it('resolveExerciseCueRequestForDispatch returns null after coach emitted workout_cues_patch', () => {
    const req = {
      v: 1 as const,
      resolution_key: 'squat::0',
      exercise_name: 'Goblet Squat',
      empty_fields: ['form_cues' as const],
    };
    const resolved = resolveExerciseCueRequestForDispatch(
      { content: 'yes' },
      [
        {
          user_id: 'user-1',
          metadata: { exercise_cue_request: req },
        },
        {
          user_id: 'agent-1',
          metadata: {
            workout_cues_patch: {
              v: 1,
              resolution_key: 'squat::0',
              form_cues: 'Knees out.',
            },
          },
        },
      ],
      'agent-1',
    );
    expect(resolved).toBeNull();
  });

  it('resolveExerciseCueRequestForDispatch honors fresh trigger even after prior patch', () => {
    const req = {
      v: 1 as const,
      resolution_key: 'speed skaters::0',
      exercise_name: 'Speed Skaters',
      empty_fields: ['form_cues' as const, 'tips' as const],
    };
    const resolved = resolveExerciseCueRequestForDispatch(
      { exercise_cue_request: req },
      [
        {
          user_id: 'user-1',
          metadata: { exercise_cue_request: req },
        },
        {
          user_id: 'agent-1',
          metadata: {
            workout_cues_patch: {
              v: 1,
              resolution_key: 'speed skaters::0',
              form_cues: 'Low stance.',
            },
          },
        },
      ],
      'agent-1',
    );
    expect(resolved).toEqual(req);
  });

  it('messageRequestsCoachNotes detects coach notes phrasing', () => {
    expect(messageRequestsCoachNotes('Please add that to the coach notes.')).toBe(true);
    expect(messageRequestsCoachNotes('add the coach note again to Band resisted pushup')).toBe(
      true,
    );
    expect(messageRequestsCoachNotes('update coach_notes for that exercise')).toBe(true);
    // Production typo: "coach not" (missing final e)
    expect(
      messageRequestsCoachNotes(
        "I'm not asking for cues, I'm asking for you to add a coach not to band resisted pushups regarding how to avoid the band rolling up on my neck.",
      ),
    ).toBe(true);
    expect(messageRequestsCoachNotes('Can you help me fill in cues for Push-Ups?')).toBe(false);
    expect(messageRequestsCoachNotes('yes')).toBe(false);
  });

  it('structuralPatchIsEmptyCoachNotesClaim catches identity-only no-op patches', () => {
    expect(
      structuralPatchIsEmptyCoachNotesClaim(
        'I have added a coach note to the Band Resisted Push-Ups exercise.',
        [
          {
            op: 'update',
            block_id: 'main_emom_block',
            exercise_id: 'f527f52f-38f7-4306-aff3-9dde4a957371',
          },
        ],
      ),
    ).toBe(true);
    expect(
      structuralPatchIsEmptyCoachNotesClaim('I have added a coach note.', [
        {
          block_id: 'main-1-0',
          exercise_id: 'main-1-0:e0',
          coach_notes: 'Brace hard.',
        },
      ]),
    ).toBe(false);
  });

  it('resolveExerciseCueRequestForDispatch exits cue lock on coach-notes follow-up', () => {
    const req = {
      v: 1 as const,
      resolution_key: 'pushups::0',
      exercise_name: 'Band Resisted Push-Ups',
      empty_fields: ['form_cues' as const],
    };
    const history = [
      {
        user_id: 'user-1',
        metadata: { exercise_cue_request: req },
      },
      {
        user_id: 'agent-1',
        metadata: {},
      },
    ];
    expect(
      resolveExerciseCueRequestForDispatch(
        {},
        history,
        'agent-1',
        'Please add that to the coach notes.',
      ),
    ).toBeNull();
    // Affirmation without coach-notes phrasing still continues cue flow
    expect(resolveExerciseCueRequestForDispatch({}, history, 'agent-1', 'yes please')).toEqual(req);
  });

  it('resolveExerciseCueRequestForDispatch keeps fresh Ask Coach trigger despite coach-notes wording', () => {
    const req = {
      v: 1 as const,
      resolution_key: 'pushups::0',
      exercise_name: 'Band Resisted Push-Ups',
      empty_fields: ['form_cues' as const],
    };
    expect(
      resolveExerciseCueRequestForDispatch(
        { exercise_cue_request: req },
        [],
        'agent-1',
        'Please add coach notes for Band Resisted Push-Ups',
      ),
    ).toEqual(req);
  });
});
