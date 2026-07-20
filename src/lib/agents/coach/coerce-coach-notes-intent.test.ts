import { describe, it, expect } from 'vitest';
import {
  coerceCoachNotesIntent,
  extractCoachNotesHintFromUserMessage,
  finalizeCoachNotesStructuralPatch,
  findLatestPriorAgentReplyForCoachNotes,
  buildCoachNotesNameSearchText,
  resolveCoachNotesAddressTarget,
  resolveCoachNotesTargetFromMetadata,
} from '@/lib/agents/coach/coerce-coach-notes-intent';
import { messageRequestsCoachNotes } from '@/lib/agents/coach/exercise-cue-request';
import { applyStructuralPatchToTaskMetadata } from '@/lib/agents/_shared/workout-metadata/apply-structural-patch-to-task-metadata';
import type { CoachGeminiJsonResponse } from '@/lib/agents/coach/parse';

function baseParsed(overrides: Partial<CoachGeminiJsonResponse> = {}): CoachGeminiJsonResponse {
  return {
    reply_content: 'ok',
    create_card: false,
    task_title: null,
    task_description: null,
    coach_task_notes: null,
    update_existing_task: false,
    updated_task_title: null,
    updated_task_description: null,
    proposed_workout_metadata: null,
    proposed_workout_metadata_drops: [],
    structural_patch: null,
    coach_workout_outline: null,
    coach_workout_outline_drops: [],
    execution_patch: null,
    personal_cues_resolved: null,
    personal_cues_dropped_unanchored: 0,
    personal_cues_unanchored_drops: [],
    intake_phase: 'other',
    session_readiness_score: 0,
    missing_intake_categories: [],
    user_requested_immediate_card: false,
    session_request: false,
    task_modal_intake_patch: null,
    task_modal_intake_dropped: [],
    outline_draft_patch: null,
    outline_draft_patch_drops: [],
    card_action: null,
    workout_cues_patch: null,
    ...overrides,
  };
}

const PUSH_UUID = 'f527f52f-38f7-4306-aff3-9dde4a957371';
const CONTEXT_JSON = JSON.stringify({
  structural_address_map: [
    {
      block_id: 'main-1-0',
      block_name: 'MAIN — EMOM',
      exercises: [
        { exercise_id: PUSH_UUID, name: 'Band Resisted Push-Ups' },
        { exercise_id: 'main-1-0:e1', name: 'Band Face Pulls' },
      ],
    },
  ],
});

describe('coerceCoachNotesIntent', () => {
  it('is a no-op when the user did not ask for coach notes', () => {
    const parsed = baseParsed({
      workout_cues_patch: {
        v: 1,
        resolution_key: 'band resisted push-ups::0',
        form_cues: 'Brace hard.',
      },
    });
    expect(
      coerceCoachNotesIntent({
        parsed,
        triggerContent: 'yes please fill the cues',
        currentWorkoutContextJson: CONTEXT_JSON,
      }),
    ).toBe(parsed);
  });

  it('remaps workout_cues_patch prose onto verified address-map ids', () => {
    const out = coerceCoachNotesIntent({
      parsed: baseParsed({
        reply_content: 'I have added the cues to the coach notes.',
        workout_cues_patch: {
          v: 1,
          resolution_key: 'band resisted push-ups::0',
          form_cues: 'Brace the core and press evenly through both hands.',
        },
      }),
      triggerContent: 'Please add that to the coach notes for Band Resisted Push-Ups.',
      currentWorkoutContextJson: CONTEXT_JSON,
    });
    expect(out.workout_cues_patch).toBeNull();
    expect(out.update_existing_task).toBe(true);
    expect(out.structural_patch).toEqual([
      {
        block_id: 'main-1-0',
        exercise_id: PUSH_UUID,
        coach_notes: 'Brace the core and press evenly through both hands.',
      },
    ]);
  });

  it('rewrites placeholder block_id using exercise UUID + user note hint', () => {
    const out = coerceCoachNotesIntent({
      parsed: baseParsed({
        reply_content:
          'I have added the coach notes for Band Resisted Push-Ups, specifying band placement to prevent rolling.',
        structural_patch: [
          {
            block_id: 'main_emom_block_id',
            exercise_id: PUSH_UUID,
            op: 'update',
          },
        ],
      }),
      triggerContent:
        "please write the coach notes for band resisted push-ups. These aren't form cues, just notes on how to do them to avoid the band rolling up to the back of the neck.",
      currentWorkoutContextJson: CONTEXT_JSON,
    });
    expect(out.workout_cues_patch).toBeNull();
    expect(out.structural_patch).toEqual([
      {
        block_id: 'main-1-0',
        exercise_id: PUSH_UUID,
        coach_notes: 'Avoid the band rolling up to the back of the neck',
      },
    ]);
  });

  it('clears fake structural patch when notes cannot be resolved', () => {
    const out = coerceCoachNotesIntent({
      parsed: baseParsed({
        reply_content: 'I have added the coach notes.',
        structural_patch: [
          { block_id: 'main_emom_block_id', exercise_id: 'missing', op: 'update' },
        ],
      }),
      triggerContent: 'add coach notes please',
      currentWorkoutContextJson: CONTEXT_JSON,
    });
    expect(out.workout_cues_patch).toBeNull();
    expect(out.structural_patch).toBeNull();
    expect(out.update_existing_task).toBe(false);
  });
});

describe('extractCoachNotesHintFromUserMessage', () => {
  it('extracts instructional note content from the ask', () => {
    expect(
      extractCoachNotesHintFromUserMessage(
        'write the coach notes. just notes on how to do them to avoid the band rolling up to the back of the neck.',
      ),
    ).toBe('Avoid the band rolling up to the back of the neck');
  });

  it('extracts regarding-how-to phrasing from production typo ask', () => {
    expect(
      extractCoachNotesHintFromUserMessage(
        "I'm not asking for cues, I'm asking for you to add a coach not to band resisted pushups regarding how to avoid the band rolling up on my neck.",
      ),
    ).toBe('Avoid the band rolling up on my neck');
  });
});

describe('referential coach notes from prior agent reply', () => {
  const FOAM_MERGE = {
    ai_workout_factory: {
      workout_set: {
        exerciseBlocks: [
          {
            id: 'warmup-1-0',
            order: 1,
            name: 'Warm-up',
            exercises: [
              { exerciseName: 'Foam Roller Thoracic Extension', sets: 2, reps: '10' },
              { exerciseName: 'Band Pull-Aparts', sets: 2, reps: '12' },
            ],
          },
        ],
      },
    },
  };

  const PRIOR_REPLY =
    'You should feel the Foam Roller Thoracic Extension primarily in your mid-back (thoracic spine) as it extends, and potentially a stretch in your chest and shoulders. Avoid feeling it in your lower back or neck.';

  it('pulls note body from prior agent reply when user says add this to Coach Note', () => {
    const trigger = 'Add this explanation to the Coach Note.';
    const history = [
      {
        id: 'u1',
        user_id: 'user',
        content: 'Please explain where I should feel the #Foam Roller Thoracic Extension',
      },
      { id: 'a1', user_id: 'agent', content: PRIOR_REPLY },
    ];
    const prior = findLatestPriorAgentReplyForCoachNotes(history, 'agent', 'u2');
    expect(prior).toBe(PRIOR_REPLY.slice(0, 240));
    const nameSearch = buildCoachNotesNameSearchText(trigger, history, 'agent');
    const finalized = finalizeCoachNotesStructuralPatch({
      mergeBase: FOAM_MERGE,
      triggerContent: trigger,
      structuralPatch: null,
      priorAgentReply: prior,
      nameSearchText: nameSearch,
    });
    expect(finalized?.[0]?.exercise_id).toBe('warmup-1-0:e0');
    expect(finalized?.[0]?.coach_notes).toContain('mid-back');
    const { touched, metadata } = applyStructuralPatchToTaskMetadata(FOAM_MERGE, finalized!);
    expect(touched).toBe(true);
    const ex = (
      metadata as {
        ai_workout_factory: {
          workout_set: { exerciseBlocks: { exercises: { coachNotes?: string }[] }[] };
        };
      }
    ).ai_workout_factory.workout_set.exerciseBlocks[0]!.exercises[0]!;
    expect(ex.coachNotes).toContain('mid-back');
  });

  it('does not steal Band Pull-Aparts notes onto Foam Roller when both appear in history', () => {
    const foamReply =
      'You should feel the Foam Roller Thoracic Extension primarily in your mid-back (thoracic spine).';
    const bandReply =
      'You should feel the Band Pull-Aparts primarily in your upper back, specifically targeting the rhomboids and rear deltoids.';
    const history = [
      {
        id: 'u1',
        user_id: 'user',
        content: 'Where should I feel the #Foam Roller Thoracic Extension ?',
      },
      { id: 'a1', user_id: 'agent', content: foamReply },
      { id: 'u2', user_id: 'user', content: 'Add this explanation to the Coach Notes.' },
      {
        id: 'a2',
        user_id: 'agent',
        content: 'I have added the explanation regarding Foam Roller to its coach notes.',
      },
      {
        id: 'u3',
        user_id: 'user',
        content: 'Where should I feel the #Band Pull-Aparts?',
      },
      { id: 'a3', user_id: 'agent', content: bandReply },
    ];
    const trigger = 'Add this explanation to the Coach Note.';
    const nameSearch = buildCoachNotesNameSearchText(trigger, history, 'agent');
    expect(nameSearch).toContain('#Band Pull-Aparts');
    expect(nameSearch).not.toContain('#Foam Roller');
    const prior = findLatestPriorAgentReplyForCoachNotes(history, 'agent');
    expect(prior).toContain('Band Pull-Aparts');
    const finalized = finalizeCoachNotesStructuralPatch({
      mergeBase: FOAM_MERGE,
      triggerContent: trigger,
      structuralPatch: null,
      priorAgentReply: prior,
      nameSearchText: nameSearch,
    });
    expect(finalized?.[0]?.exercise_id).toBe('warmup-1-0:e1');
    expect(finalized?.[0]?.coach_notes).toContain('rhomboids');
  });
});

describe('resolveCoachNotesAddressTarget', () => {
  it('prefers address-map row for model exercise UUID over fake block_id', () => {
    expect(
      resolveCoachNotesAddressTarget({
        addressMap: JSON.parse(CONTEXT_JSON).structural_address_map,
        structuralPatch: [{ block_id: 'main_emom_block_id', exercise_id: PUSH_UUID, op: 'update' }],
        triggerContent: 'coach notes',
      }),
    ).toEqual({ block_id: 'main-1-0', exercise_id: PUSH_UUID });
  });
});

/** DB merge base where address-map UUID is absent (production miss shape). */
const DB_MERGE_BASE = {
  ai_workout_factory: {
    workout_set: {
      exerciseBlocks: [
        {
          id: 'main-1-0',
          order: 1,
          name: 'MAIN — EMOM',
          exercises: [
            {
              id: 'main-1-0:e0',
              exerciseName: 'Band Resisted Push-Ups',
              sets: 8,
              reps: '10',
            },
            {
              id: 'main-1-0:e1',
              exerciseName: 'Band Face Pulls',
              sets: 8,
              reps: '12',
            },
          ],
        },
      ],
    },
  },
};

/** Production shape: null exercise ids on DB (UUID from address map cannot match). */
const DB_MERGE_BASE_NULL_IDS = {
  ai_workout_factory: {
    workout_set: {
      exerciseBlocks: [
        {
          id: 'main-1-0',
          order: 1,
          name: 'MAIN — EMOM',
          exercises: [
            { exerciseName: 'Foam Roller Thoracic Extension', sets: 2, reps: '10' },
            { exerciseName: 'Band Pull-Aparts', sets: 2, reps: '12' },
            { exerciseName: 'Quadruped Serratus Slides', sets: 2, reps: '10' },
            { exerciseName: 'Band Resisted Push-Ups', sets: 8, reps: '10' },
            { exerciseName: 'Band Face Pulls', sets: 8, reps: '12' },
            { exerciseName: 'Mountain Climbers', sets: 8, reps: '30s' },
          ],
        },
      ],
    },
  },
};

describe('finalizeCoachNotesStructuralPatch (DB merge base)', () => {
  it('resolves by exercise name when address-map UUID is not on DB', () => {
    const trigger =
      "please write the coach notes for band resisted push-ups. These aren't form cues, just notes on how to do them to avoid the band rolling up to the back of the neck.";
    const finalized = finalizeCoachNotesStructuralPatch({
      mergeBase: DB_MERGE_BASE,
      triggerContent: trigger,
      structuralPatch: [
        {
          block_id: 'main_emom_block_id',
          exercise_id: PUSH_UUID,
          op: 'update',
        },
      ],
    });
    expect(finalized).toEqual([
      {
        block_id: 'main-1-0',
        exercise_id: 'main-1-0:e0',
        coach_notes: 'Avoid the band rolling up to the back of the neck',
      },
    ]);

    const { touched, metadata } = applyStructuralPatchToTaskMetadata(DB_MERGE_BASE, finalized!);
    expect(touched).toBe(true);
    const ex = (
      metadata as {
        ai_workout_factory: {
          workout_set: { exerciseBlocks: { exercises: { coachNotes?: string }[] }[] };
        };
      }
    ).ai_workout_factory.workout_set.exerciseBlocks[0]!.exercises[0]!;
    expect(ex.coachNotes).toBe('Avoid the band rolling up to the back of the neck');
  });

  it('production log shape: typo coach not + null DB ids + empty patch → notes land by name', () => {
    const trigger =
      "I'm not asking for cues, I'm asking for you to add a coach not to band resisted pushups regarding how to avoid the band rolling up on my neck.";
    expect(messageRequestsCoachNotes(trigger)).toBe(true);
    const finalized = finalizeCoachNotesStructuralPatch({
      mergeBase: DB_MERGE_BASE_NULL_IDS,
      triggerContent: trigger,
      structuralPatch: [
        {
          op: 'update',
          block_id: 'main_emom_block',
          exercise_id: PUSH_UUID,
        },
      ],
    });
    expect(finalized?.[0]?.coach_notes).toBe('Avoid the band rolling up on my neck');
    expect(finalized?.[0]?.exercise_id).toBe('main-1-0:e3');

    const { touched, metadata } = applyStructuralPatchToTaskMetadata(
      DB_MERGE_BASE_NULL_IDS,
      finalized!,
    );
    expect(touched).toBe(true);
    const ex = (
      metadata as {
        ai_workout_factory: {
          workout_set: { exerciseBlocks: { exercises: { coachNotes?: string }[] }[] };
        };
      }
    ).ai_workout_factory.workout_set.exerciseBlocks[0]!.exercises[3]!;
    expect(ex.coachNotes).toBe('Avoid the band rolling up on my neck');
  });

  it('resolveCoachNotesTargetFromMetadata prefers model id when present on DB', () => {
    expect(
      resolveCoachNotesTargetFromMetadata({
        mergeBase: DB_MERGE_BASE,
        triggerContent: 'coach notes',
        modelExerciseId: 'main-1-0:e1',
      }),
    ).toEqual({ block_id: 'main-1-0', exercise_id: 'main-1-0:e1' });
  });
});
