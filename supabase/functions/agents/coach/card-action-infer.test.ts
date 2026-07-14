import { assertEquals } from 'jsr:@std/assert@1';
import {
  GENERATOR_REPLY_RE,
  inferCardActionTriggerGeneration,
  userMessageShowsGenerateConsent,
} from './card-action-infer.ts';
import type { CoachGeminiJsonResponse } from './parse.ts';

function baseParsed(overrides: Partial<CoachGeminiJsonResponse> = {}): CoachGeminiJsonResponse {
  return {
    reply_content: 'Starting the generator now — give me about a minute.',
    create_card: false,
    task_title: null,
    task_description: null,
    coach_task_notes: null,
    proposed_workout_metadata: null,
    proposed_workout_metadata_drops: [],
    execution_patch: null,
    task_modal_intake_patch: null,
    task_modal_intake_dropped: false,
    personal_cues_resolved: null,
    personal_cues_dropped_unanchored: 0,
    personal_cues_unanchored_drops: [],
    card_action: null,
    update_existing_task: false,
    updated_task_title: null,
    updated_task_description: null,
    intake_phase: 'other',
    session_readiness_score: null,
    missing_intake_categories: [],
    user_requested_immediate_card: false,
    session_request: false,
    ...overrides,
  };
}

Deno.test('userMessageShowsGenerateConsent matches draft / generate phrases', () => {
  assertEquals(userMessageShowsGenerateConsent('Please draft the outline'), true);
  assertEquals(userMessageShowsGenerateConsent('go ahead and generate'), true);
  assertEquals(userMessageShowsGenerateConsent('swap squats for hinges'), false);
  assertEquals(
    userMessageShowsGenerateConsent("I'd like you to add a title and description to this workout"),
    false,
  );
});

Deno.test('inferCardActionTriggerGeneration on rail with generator prose', () => {
  const action = inferCardActionTriggerGeneration({
    isRailSurface: true,
    currentWorkoutContextJson: null,
    triggerContent: 'Please draft the outline',
    parsed: baseParsed(),
  });
  assertEquals(action, 'trigger_generation');
});

Deno.test('inferCardActionTriggerGeneration skips when rich workout context present', () => {
  const action = inferCardActionTriggerGeneration({
    isRailSurface: true,
    currentWorkoutContextJson: '{"workouts":[]}',
    triggerContent: 'go ahead',
    parsed: baseParsed(),
  });
  assertEquals(action, null);
});

Deno.test('GENERATOR_REPLY_RE matches production Coach copy', () => {
  assertEquals(
    GENERATOR_REPLY_RE.test('Starting the generator now — give me about a minute.'),
    true,
  );
});
