/**
 * Vitest coverage for `applyCoachServerGuards`.
 *
 * Three describe blocks, one per guard, with table-driven fixtures so a regression in
 * any single legacy branch surfaces as a single failed assertion. The fixtures mirror
 * the input shapes seen in production today (`bubble-agent-dispatch/index.ts:1683-1725`).
 */

import { describe, expect, it } from 'vitest';

import type { CoachGeminiJsonResponse } from './parse';
import {
  applyCoachServerGuards,
  looksLikeWorkoutPrescriptionDump,
  stripStructuralWritesForWorkoutCuePatch,
  type CoachGuardsFragment,
} from './server-guards';

function makeParsed(overrides: Partial<CoachGeminiJsonResponse> = {}): CoachGeminiJsonResponse {
  return {
    reply_content: 'ok',
    create_card: false,
    task_title: null,
    task_description: null,
    update_existing_task: false,
    updated_task_title: null,
    updated_task_description: null,
    intake_phase: 'clarifying_session',
    session_readiness_score: 50,
    missing_intake_categories: [],
    user_requested_immediate_card: false,
    session_request: false,
    coach_task_notes: null,
    proposed_workout_metadata: null,
    proposed_workout_metadata_drops: [],
    coach_workout_outline: null,
    coach_workout_outline_drops: [],
    structural_patch: null,
    execution_patch: null,
    personal_cues_resolved: null,
    personal_cues_dropped_unanchored: 0,
    personal_cues_unanchored_drops: [],
    task_modal_intake_patch: null,
    task_modal_intake_dropped: [],
    card_action: null,
    outline_draft_patch: null,
    outline_draft_patch_drops: [],
    workout_cues_patch: null,
    ...overrides,
  };
}

const NO_TASK_FRAGMENT: CoachGuardsFragment = {
  knownTargetTaskId: null,
  priorUserMessageCount: 5,
  currentWorkoutContextJson: null,
  isActiveWorkoutSession: false,
  outlineCoPilotActive: false,
  exerciseCueRequestActive: false,
};

describe('applyCoachServerGuards — Open Canvas guard', () => {
  it('clears card fields when knownTargetTaskId is set and the model wants update_existing_task', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'New Workout',
      task_description: 'desc',
      coach_task_notes: 'notes',
      update_existing_task: true,
      updated_task_title: 'Updated',
      updated_task_description: 'updated desc',
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      knownTargetTaskId: 'task-123',
    });
    expect(out.create_card).toBe(false);
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.coach_task_notes).toBeNull();
    // Draft branch keeps the update fields so persistence can route to the draft RPC.
    expect(out.update_existing_task).toBe(true);
    expect(out.updated_task_title).toBe('Updated');
    expect(out.updated_task_description).toBe('updated desc');
  });

  it('blocks create_card when knownTargetTaskId is set even without update_existing_task', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Kettlebell & Bodyweight Core Blast',
      task_description: 'This workout focuses on strengthening your core.',
      coach_task_notes: 'notes',
      reply_content: 'Starting the generator now — give me about a minute.',
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      knownTargetTaskId: 'task-123',
    });
    expect(out.create_card).toBe(false);
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.coach_task_notes).toBeNull();
    expect(out.update_existing_task).toBe(true);
    expect(out.updated_task_title).toBe('Kettlebell & Bodyweight Core Blast');
    expect(out.updated_task_description).toBe('This workout focuses on strengthening your core.');
  });

  it('does NOT clear card fields when no knownTargetTaskId is resolved', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Title',
      task_description: 'desc',
      coach_task_notes: 'notes',
      update_existing_task: true,
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.create_card).toBe(true);
    expect(out.task_title).toBe('Title');
    expect(out.task_description).toBe('desc');
    expect(out.coach_task_notes).toBe('notes');
  });
});

describe('applyCoachServerGuards — Layer B turn gate', () => {
  it('blocks first-message card creation (first_message_card_blocked)', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Quick Workout',
      task_description: 'desc',
      coach_task_notes: 'notes',
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      priorUserMessageCount: 0,
    });
    expect(out.create_card).toBe(false);
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.coach_task_notes).toBeNull();
  });

  it('does not clear card_action on first-message Layer B card block', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Quick Workout',
      task_description: 'desc',
      card_action: 'trigger_generation',
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      priorUserMessageCount: 0,
    });
    expect(out.create_card).toBe(false);
    expect(out.card_action).toBe('trigger_generation');
  });

  it('blocks session_request card creation when prior count < 2 (session_request_turn_gate)', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Quick Workout',
      task_description: 'desc',
      coach_task_notes: 'notes',
      session_request: true,
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      priorUserMessageCount: 1,
    });
    expect(out.create_card).toBe(false);
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.coach_task_notes).toBeNull();
  });

  it('honors user_requested_immediate_card waiver on first message', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Right Now',
      task_description: 'desc',
      coach_task_notes: 'notes',
      user_requested_immediate_card: true,
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      priorUserMessageCount: 0,
    });
    expect(out.create_card).toBe(true);
    expect(out.task_title).toBe('Right Now');
    expect(out.task_description).toBe('desc');
    expect(out.coach_task_notes).toBe('notes');
  });

  it('lets a normal third-turn session_request through when no other guard fires', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Plan',
      task_description: 'desc',
      coach_task_notes: 'notes',
      session_request: true,
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      priorUserMessageCount: 2,
    });
    expect(out.create_card).toBe(true);
    expect(out.task_title).toBe('Plan');
  });
});

describe('applyCoachServerGuards — Active-workout clamp', () => {
  it('blocks new card creation when workout context exists; preserves task updates + intake + proposed when not active session', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Title',
      task_description: 'desc',
      coach_task_notes: 'notes',
      update_existing_task: true,
      updated_task_title: 'Updated',
      updated_task_description: 'updated desc',
      proposed_workout_metadata: { workout_type: 'AMRAP' },
      task_modal_intake_patch: { readiness: 7 },
      execution_patch: [{ exerciseIndex: 0, setIndex: 0, weight: '60' }],
      personal_cues_resolved: [
        { exercise_dictionary_id: 'd1', mode: 'append', form_cues: 'brace hard' },
      ],
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{"exercises":[]}',
      isActiveWorkoutSession: false,
      outlineCoPilotActive: false,
      exerciseCueRequestActive: false,
    });
    expect(out.create_card).toBe(false);
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.coach_task_notes).toBeNull();
    expect(out.update_existing_task).toBe(true);
    expect(out.updated_task_title).toBe('Updated');
    expect(out.updated_task_description).toBe('updated desc');
    expect(out.proposed_workout_metadata).toEqual({ workout_type: 'AMRAP' });
    expect(out.task_modal_intake_patch).toEqual({ readiness: 7 });
    expect(out.execution_patch).toEqual([{ exerciseIndex: 0, setIndex: 0, weight: '60' }]);
    expect(out.personal_cues_resolved).toEqual([
      {
        exercise_dictionary_id: 'd1',
        mode: 'append',
        form_cues: 'brace hard',
      },
    ]);
  });

  it('preserves proposed_workout_metadata with blocks when workout context exists but session is not active', () => {
    const proposed = {
      workout_type: 'AMRAP',
      blocks: [{ name: 'Finisher', exercises: [{ name: 'Thruster', sets: 3, reps: 10 }] }],
    };
    const parsed = makeParsed({
      update_existing_task: true,
      proposed_workout_metadata: proposed,
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{"exercises":[]}',
      isActiveWorkoutSession: false,
      outlineCoPilotActive: false,
      exerciseCueRequestActive: false,
    });
    expect(out.proposed_workout_metadata).toEqual(proposed);
    expect(out.update_existing_task).toBe(true);
  });

  it('clears proposed_workout_metadata, task_modal_intake_patch, and task update fields when active workout session', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Title',
      task_description: 'desc',
      coach_task_notes: 'notes',
      update_existing_task: true,
      updated_task_title: 'Updated',
      updated_task_description: 'updated desc',
      proposed_workout_metadata: { workout_type: 'AMRAP' },
      task_modal_intake_patch: { readiness: 9 },
      execution_patch: [{ exerciseIndex: 0, setIndex: 0, weight: '60' }],
      personal_cues_resolved: [
        { exercise_dictionary_id: 'd1', mode: 'append', form_cues: 'brace hard' },
      ],
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{"exercises":[]}',
      isActiveWorkoutSession: true,
      outlineCoPilotActive: false,
      exerciseCueRequestActive: false,
    });
    expect(out.create_card).toBe(false);
    expect(out.update_existing_task).toBe(false);
    expect(out.updated_task_title).toBeNull();
    expect(out.updated_task_description).toBeNull();
    expect(out.proposed_workout_metadata).toBeNull();
    expect(out.task_modal_intake_patch).toBeNull();
    expect(out.card_action).toBeNull();
    expect(out.execution_patch).toEqual([{ exerciseIndex: 0, setIndex: 0, weight: '60' }]);
    expect(out.personal_cues_resolved).toEqual([
      {
        exercise_dictionary_id: 'd1',
        mode: 'append',
        form_cues: 'brace hard',
      },
    ]);
  });

  it('does not mutate the input payload', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Title',
      task_description: 'desc',
      coach_task_notes: 'notes',
      proposed_workout_metadata: { workout_type: 'AMRAP' },
    });
    const snapshot = JSON.parse(JSON.stringify(parsed)) as CoachGeminiJsonResponse;
    applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{}',
      isActiveWorkoutSession: false,
      outlineCoPilotActive: false,
      exerciseCueRequestActive: false,
    });
    expect(parsed).toEqual(snapshot);
  });
});

describe('applyCoachServerGuards — Narrative vs Structure killswitch', () => {
  it('nulls updated_task_description when blocks[] is non-empty', () => {
    const blocks = [
      {
        name: 'Main',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 12 },
        exercises: [{ name: 'Burpees' }],
      },
    ];
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_title: 'Leg day',
      updated_task_description: 'Full prose workout narrative',
      proposed_workout_metadata: { blocks },
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.updated_task_description).toBeNull();
    expect(out.updated_task_title).toBe('Leg day');
    expect(out.proposed_workout_metadata?.blocks).toEqual(blocks);
  });

  it('nulls prose when instruction-only blocks are present', () => {
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: 'Walk and stretch',
      proposed_workout_metadata: {
        blocks: [{ name: 'Cool down', instructions: ['Walk 2 min'] }],
      },
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.updated_task_description).toBeNull();
  });

  it('preserves prose when blocks are absent or empty', () => {
    const withNull = makeParsed({
      updated_task_description: 'Keep this',
      proposed_workout_metadata: null,
    });
    expect(applyCoachServerGuards(withNull, NO_TASK_FRAGMENT).updated_task_description).toBe(
      'Keep this',
    );

    const withEmpty = makeParsed({
      updated_task_description: 'Keep this too',
      proposed_workout_metadata: { blocks: [] },
    });
    expect(applyCoachServerGuards(withEmpty, NO_TASK_FRAGMENT).updated_task_description).toBe(
      'Keep this too',
    );
  });

  it('active workout session clears proposed metadata after Guard 3', () => {
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: 'Should be nulled by Guard 4 then cleared by Guard 3',
      proposed_workout_metadata: {
        blocks: [{ name: 'Main', exercises: [{ name: 'Squat' }] }],
      },
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{}',
      isActiveWorkoutSession: true,
      outlineCoPilotActive: false,
      exerciseCueRequestActive: false,
    });
    expect(out.updated_task_description).toBeNull();
    expect(out.proposed_workout_metadata).toBeNull();
  });
});

const PLANNED_WORKOUT_FRAGMENT: CoachGuardsFragment = {
  ...NO_TASK_FRAGMENT,
  currentWorkoutContextJson: '{"exercises":[{"name":"Goblet Squat"}]}',
  isActiveWorkoutSession: false,
  outlineCoPilotActive: false,
  exerciseCueRequestActive: false,
};

const FINISHER_PROSE_DUMP =
  'WARM-UP:\n' +
  '- Goblet Squat 3x10\n' +
  '- Push Press 3 sets of 12\n' +
  '- Row 3x12\n\n' +
  'MAIN:\n' +
  '- Deadlift 4 sets of 5\n' +
  '- Bulgarian Split Squat 3x8 each leg\n\n' +
  'FINISHER:\n' +
  '- Kettlebell Thrusters 3x10\n' +
  '- Burpees 3 sets of 15\n\n' +
  'COOL DOWN:\n' +
  '- Walk 2 min\n' +
  '- Stretch hips 60s';

describe('looksLikeWorkoutPrescriptionDump', () => {
  it('returns false for short summaries', () => {
    expect(
      looksLikeWorkoutPrescriptionDump('Full body AMRAP with supersets and mobility finisher.'),
    ).toBe(false);
  });

  it('returns true for section-header prescription dumps', () => {
    expect(looksLikeWorkoutPrescriptionDump(FINISHER_PROSE_DUMP)).toBe(true);
  });
});

describe('applyCoachServerGuards — Prescription dump without structure (Guard 6)', () => {
  it('nulls updated_task_description when workout context exists and no proposed metadata', () => {
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: FINISHER_PROSE_DUMP,
      proposed_workout_metadata: null,
    });
    const out = applyCoachServerGuards(parsed, PLANNED_WORKOUT_FRAGMENT);
    expect(out.updated_task_description).toBeNull();
  });

  it('preserves short description-only updates when workout context exists', () => {
    const short = 'Full body AMRAP with supersets and mobility finisher.';
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: short,
      proposed_workout_metadata: null,
    });
    const out = applyCoachServerGuards(parsed, PLANNED_WORKOUT_FRAGMENT);
    expect(out.updated_task_description).toBe(short);
  });

  it('preserves description when flat exercises are proposed', () => {
    const prose = FINISHER_PROSE_DUMP;
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: prose,
      proposed_workout_metadata: {
        exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: 10 }],
      },
    });
    const out = applyCoachServerGuards(parsed, PLANNED_WORKOUT_FRAGMENT);
    expect(out.updated_task_description).toBe(prose);
  });

  it('nulls description via Guard 4 when blocks are present', () => {
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: FINISHER_PROSE_DUMP,
      proposed_workout_metadata: {
        blocks: [{ name: 'Finisher', exercises: [{ name: 'Thruster', sets: 3, reps: 10 }] }],
      },
    });
    const out = applyCoachServerGuards(parsed, PLANNED_WORKOUT_FRAGMENT);
    expect(out.updated_task_description).toBeNull();
    expect(out.proposed_workout_metadata?.blocks).toHaveLength(1);
  });
});

describe('applyCoachServerGuards — coach_workout_outline (Apex Phase 2)', () => {
  it('preserves outline with create_card when no workout context', () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 10, is_alternating: true },
        exercises: [{ name: 'Swing' }, { name: 'Push-up' }],
      },
    ];
    const parsed = makeParsed({
      create_card: true,
      task_title: 'EMOM Day',
      task_description: 'Summary',
      coach_workout_outline: outline,
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.create_card).toBe(true);
    expect(out.coach_workout_outline).toEqual(outline);
  });

  it('clears outline on active workout session with proposed metadata', () => {
    const parsed = makeParsed({
      coach_workout_outline: [
        { name: 'Main', block_format: 'amrap', format_params: { time_cap_minutes: 12 } },
      ],
      proposed_workout_metadata: { workout_type: 'AMRAP' },
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{"exercises":[]}',
      isActiveWorkoutSession: true,
      outlineCoPilotActive: false,
      exerciseCueRequestActive: false,
    });
    expect(out.coach_workout_outline).toBeNull();
    expect(out.proposed_workout_metadata).toBeNull();
  });

  it('nulls updated_task_description when outline is non-empty (Guard 4)', () => {
    const parsed = makeParsed({
      update_existing_task: true,
      updated_task_description: FINISHER_PROSE_DUMP,
      coach_workout_outline: [
        {
          name: 'Main',
          block_format: 'emom',
          format_params: { interval_seconds: 60, total_minutes: 8 },
          exercises: [{ name: 'Row' }],
        },
      ],
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.updated_task_description).toBeNull();
    expect(out.coach_workout_outline).toHaveLength(1);
  });
});

describe('applyCoachServerGuards — Action exclusivity (Guard 5)', () => {
  it('nulls proposed_workout_metadata and updated_task_description; preserves title', () => {
    const parsed = makeParsed({
      card_action: 'trigger_generation',
      update_existing_task: true,
      updated_task_title: 'Leg day',
      updated_task_description: 'Full prose',
      proposed_workout_metadata: { workout_type: 'AMRAP' },
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.card_action).toBe('trigger_generation');
    expect(out.updated_task_title).toBe('Leg day');
    expect(out.updated_task_description).toBeNull();
    expect(out.proposed_workout_metadata).toBeNull();
    expect(out.coach_workout_outline).toBeNull();
  });
});

describe('applyCoachServerGuards — exercise cue flow clamp', () => {
  it('strips proposed_workout_metadata when exerciseCueRequestActive', () => {
    const out = applyCoachServerGuards(
      makeParsed({
        proposed_workout_metadata: { blocks: [{ name: 'Main', exercises: [{ name: 'Squat' }] }] },
        update_existing_task: true,
        updated_task_title: 'Leg day',
        personal_cues_resolved: [
          { exercise_dictionary_id: 'uuid', mode: 'append', form_cues: 'knees out' },
        ],
      }),
      {
        ...NO_TASK_FRAGMENT,
        exerciseCueRequestActive: true,
      },
    );
    expect(out.proposed_workout_metadata).toBeNull();
    expect(out.update_existing_task).toBe(false);
    expect(out.updated_task_title).toBeNull();
    expect(out.personal_cues_resolved).toBeNull();
  });

  it('strips proposed_workout_metadata when workout_cues_patch is emitted', () => {
    const out = applyCoachServerGuards(
      makeParsed({
        proposed_workout_metadata: { exercises: [{ name: 'Squat' }] },
        task_title: 'Hallucinated title',
        task_description: 'Hallucinated desc',
        workout_cues_patch: {
          v: 1,
          resolution_key: 'squat::0',
          form_cues: 'Brace core.',
        },
      }),
      NO_TASK_FRAGMENT,
    );
    expect(out.proposed_workout_metadata).toBeNull();
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.workout_cues_patch?.form_cues).toBe('Brace core.');
  });
});

describe('stripStructuralWritesForWorkoutCuePatch', () => {
  it('nulls structural fields when workout_cues_patch is present', () => {
    const out = stripStructuralWritesForWorkoutCuePatch(
      makeParsed({
        create_card: true,
        task_title: 'Bad',
        proposed_workout_metadata: { blocks: [] },
        workout_cues_patch: {
          v: 1,
          resolution_key: 'squat::0',
          tips: 'Stay tight.',
        },
      }),
    );
    expect(out.proposed_workout_metadata).toBeNull();
    expect(out.task_title).toBeNull();
    expect(out.create_card).toBe(false);
    expect(out.workout_cues_patch?.tips).toBe('Stay tight.');
  });

  it('returns input unchanged when workout_cues_patch is absent', () => {
    const parsed = makeParsed({ task_title: 'Keep' });
    expect(stripStructuralWritesForWorkoutCuePatch(parsed)).toBe(parsed);
  });
});

describe('applyCoachServerGuards — Self-attestation', () => {
  it('throws when reply_content claims an update without structured writes', () => {
    const parsed = makeParsed({
      reply_content: "I've updated your workout card with new cues for every exercise.",
    });
    try {
      applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
      expect.fail('expected self_attestation_mismatch');
    } catch (e) {
      expect(e).toEqual({ kind: 'self_attestation_mismatch' });
    }
  });

  it('allows narrative when only card_action is present', () => {
    const parsed = makeParsed({
      reply_content: 'Starting the generator now on your card.',
      card_action: 'trigger_generation',
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.card_action).toBe('trigger_generation');
  });

  it('allows narrative update when personal_cues_resolved is present', () => {
    const parsed = makeParsed({
      reply_content: "I've saved your new form cues.",
      personal_cues_resolved: [
        { exercise_dictionary_id: 'uuid', mode: 'append', form_cues: 'knees out' },
      ],
    });
    const out = applyCoachServerGuards(parsed, NO_TASK_FRAGMENT);
    expect(out.reply_content).toContain('saved');
  });
});
