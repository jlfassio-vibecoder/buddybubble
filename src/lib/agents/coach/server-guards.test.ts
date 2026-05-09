import { describe, expect, it } from 'vitest';

import type { CoachGeminiJsonResponse } from './parse';
import { assertCoachReplySelfAttestation } from './server-guards';

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
    execution_patch: null,
    personal_cues_resolved: null,
    personal_cues_dropped_unanchored: 0,
    ...overrides,
  };
}

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
