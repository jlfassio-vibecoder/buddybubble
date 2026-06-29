import { describe, expect, it } from 'vitest';

import type { CoachGeminiJsonResponse } from './parse';
import { applyCoachServerGuards, assertCoachReplySelfAttestation } from './server-guards';

function baseParsed(overrides: Partial<CoachGeminiJsonResponse> = {}): CoachGeminiJsonResponse {
  return {
    reply_content: 'ok',
    create_card: false,
    task_title: null,
    task_description: null,
    update_existing_task: false,
    updated_task_title: null,
    updated_task_description: null,
    intake_phase: 'greeting',
    session_readiness_score: 0,
    missing_intake_categories: [],
    user_requested_immediate_card: false,
    session_request: false,
    coach_task_notes: null,
    proposed_workout_metadata: null,
    proposed_workout_metadata_drops: [],
    coach_workout_outline: null,
    coach_workout_outline_drops: [],
    execution_patch: null,
    personal_cues_resolved: null,
    personal_cues_dropped_unanchored: 0,
    task_modal_intake_patch: null,
    task_modal_intake_dropped: [],
    card_action: null,
    outline_draft_patch: null,
    outline_draft_patch_drops: [],
    workout_cues_patch: null,
    ...overrides,
  };
}

describe('applyCoachServerGuards outline co-pilot', () => {
  it('strips proposed_workout_metadata when outlineCoPilotActive', () => {
    const out = applyCoachServerGuards(
      baseParsed({
        proposed_workout_metadata: { blocks: [{ name: 'Main' }] },
        outline_draft_patch: {
          v: 1,
          revision: 1,
          mode: 'merge_by_name',
          blocks: [{ name: 'Finisher', block_format: 'tabata' }],
          clear_confirmation: true,
        },
      }),
      {
        knownTargetTaskId: 'task-1',
        priorUserMessageCount: 2,
        currentWorkoutContextJson: null,
        isActiveWorkoutSession: false,
        outlineCoPilotActive: true,
      },
    );
    expect(out.proposed_workout_metadata).toBeNull();
    expect(out.outline_draft_patch?.blocks[0]?.name).toBe('Finisher');
  });

  it('nulls outline_draft_patch when all blocks have verbose names', () => {
    const out = applyCoachServerGuards(
      baseParsed({
        outline_draft_patch: {
          v: 1,
          revision: 2,
          mode: 'merge_by_name',
          blocks: [{ name: 'Main (AMRAP 15 min.) - 4 exercises each block' }],
          clear_confirmation: true,
        },
      }),
      {
        knownTargetTaskId: 'task-1',
        priorUserMessageCount: 2,
        currentWorkoutContextJson: null,
        isActiveWorkoutSession: false,
        outlineCoPilotActive: true,
      },
    );
    expect(out.outline_draft_patch).toBeNull();
    expect(out.outline_draft_patch_drops.some((d) => d.reason === 'block_name_too_verbose')).toBe(
      true,
    );
  });

  it('throws self_attestation when outline co-pilot claims structure update without patch', () => {
    expect(() =>
      applyCoachServerGuards(
        baseParsed({
          reply_content:
            'The workout structure has been updated with Circuit 1 AMRAP for 15 minutes.',
          outline_draft_patch: null,
        }),
        {
          knownTargetTaskId: 'task-1',
          priorUserMessageCount: 2,
          currentWorkoutContextJson: null,
          isActiveWorkoutSession: false,
          outlineCoPilotActive: true,
        },
      ),
    ).toThrow();
  });

  it('throws self_attestation when outline co-pilot claims block was added without patch', () => {
    expect(() =>
      applyCoachServerGuards(
        baseParsed({
          reply_content: 'A 10-minute Finisher AMRAP block has been added to your workout outline.',
          outline_draft_patch: null,
        }),
        {
          knownTargetTaskId: 'task-1',
          priorUserMessageCount: 2,
          currentWorkoutContextJson: null,
          isActiveWorkoutSession: false,
          outlineCoPilotActive: true,
        },
      ),
    ).toThrow();
  });
});

describe('assertCoachReplySelfAttestation', () => {
  it('does not throw when reply has no attestation phrases', () => {
    expect(() =>
      assertCoachReplySelfAttestation(baseParsed({ reply_content: 'Here is some advice.' })),
    ).not.toThrow();
  });

  it('throws when reply claims an update with no structured write', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({ reply_content: "I've updated your card with wider stance cues." }),
      ),
    ).toThrow();
  });

  it('allows phrase when execution_patch is present', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({
          reply_content: "I've updated the workout.",
          execution_patch: [{ exerciseIndex: 0, setIndex: 0, reps: '5' }],
        }),
      ),
    ).not.toThrow();
  });

  it('allows phrase when personal_cues_resolved is present', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({
          reply_content: "I've added that to your saved cues.",
          personal_cues_resolved: [
            {
              exercise_dictionary_id: '00000000-0000-4000-8000-000000000001',
              mode: 'append',
              form_cues: 'knees out',
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('allows phrase when card_action is trigger_generation', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({
          reply_content: 'Starting the generator now on your card.',
          card_action: 'trigger_generation',
        }),
      ),
    ).not.toThrow();
  });

  it('allows phrase when outline_draft_patch is present', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({
          reply_content: "I've updated your workout structure.",
          outline_draft_patch: {
            v: 1,
            revision: 1,
            mode: 'merge_by_name',
            blocks: [{ name: 'Main' }],
            clear_confirmation: true,
          },
        }),
      ),
    ).not.toThrow();
  });

  it('allows phrase when workout_cues_patch is present', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({
          reply_content: "I've saved the cues on your workout.",
          workout_cues_patch: {
            v: 1,
            resolution_key: 'flat:goblet-squat',
            form_cues: 'Feet shoulder-width.',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('allows phrase when create_card is true', () => {
    expect(() =>
      assertCoachReplySelfAttestation(
        baseParsed({
          reply_content: "I've added a new workout card.",
          create_card: true,
          task_title: 'Leg day',
          task_description: 'x',
          coach_task_notes: 'notes',
        }),
      ),
    ).not.toThrow();
  });
});
