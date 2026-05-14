/**
 * Vitest coverage for `applyCoachServerGuards`.
 *
 * Three describe blocks, one per guard, with table-driven fixtures so a regression in
 * any single legacy branch surfaces as a single failed assertion. The fixtures mirror
 * the input shapes seen in production today (`bubble-agent-dispatch/index.ts:1683-1725`).
 */

import { describe, expect, it } from 'vitest';

import type { CoachGeminiJsonResponse } from './parse';
import { applyCoachServerGuards, type CoachGuardsFragment } from './server-guards';

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
    execution_patch: null,
    personal_cues_resolved: null,
    personal_cues_dropped_unanchored: 0,
    task_modal_intake_patch: null,
    task_modal_intake_dropped: [],
    ...overrides,
  };
}

const NO_TASK_FRAGMENT: CoachGuardsFragment = {
  knownTargetTaskId: null,
  priorUserMessageCount: 5,
  currentWorkoutContextJson: null,
};

describe('applyCoachServerGuards — Draft override', () => {
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
  it('clears every card + task_update field when CURRENT WORKOUT CONTEXT is present', () => {
    const parsed = makeParsed({
      create_card: true,
      task_title: 'Title',
      task_description: 'desc',
      coach_task_notes: 'notes',
      update_existing_task: true,
      updated_task_title: 'Updated',
      updated_task_description: 'updated desc',
      proposed_workout_metadata: { workout_type: 'AMRAP' },
      execution_patch: [{ exerciseIndex: 0, setIndex: 0, weight: '60' }],
      personal_cues_resolved: [
        { exercise_dictionary_id: 'd1', mode: 'append', form_cues: 'brace hard' },
      ],
    });
    const out = applyCoachServerGuards(parsed, {
      ...NO_TASK_FRAGMENT,
      currentWorkoutContextJson: '{"exercises":[]}',
    });
    expect(out.create_card).toBe(false);
    expect(out.task_title).toBeNull();
    expect(out.task_description).toBeNull();
    expect(out.coach_task_notes).toBeNull();
    expect(out.update_existing_task).toBe(false);
    expect(out.updated_task_title).toBeNull();
    expect(out.updated_task_description).toBeNull();
    expect(out.proposed_workout_metadata).toBeNull();
    // execution_patch + personal_cues survive live-session output.
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
    });
    expect(parsed).toEqual(snapshot);
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
