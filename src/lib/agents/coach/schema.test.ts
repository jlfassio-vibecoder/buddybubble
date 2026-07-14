import { describe, expect, it } from 'vitest';
import {
  COACH_EXERCISE_CUE_RESPONSE_SCHEMA,
  COACH_RESPONSE_SCHEMA,
} from '@/lib/agents/coach/schema';
import {
  COACH_CUE_REPLY_CONTENT_MAX_CHARS,
  PERSONAL_CUES_FIELD_MAX_CHARS,
  WORKOUT_CUE_FIELD_MAX_CHARS,
} from '@/lib/agents/coach/config';

describe('COACH_EXERCISE_CUE_RESPONSE_SCHEMA', () => {
  const cueProps = COACH_EXERCISE_CUE_RESPONSE_SCHEMA.properties as Record<string, unknown>;

  it('omits structural and personal-cue fields from cue-only schema', () => {
    expect(cueProps).not.toHaveProperty('proposed_workout_metadata');
    expect(cueProps).not.toHaveProperty('personal_cues_patch');
    expect(cueProps).not.toHaveProperty('execution_patch');
    expect(cueProps).not.toHaveProperty('outline_draft_patch');
    expect(cueProps).not.toHaveProperty('coach_workout_outline');
    expect(cueProps).toHaveProperty('workout_cues_patch');
  });

  it('keeps workout_cues_patch on full rail schema', () => {
    const full = COACH_RESPONSE_SCHEMA.properties as Record<string, unknown>;
    expect(full).toHaveProperty('workout_cues_patch');
    expect(full).toHaveProperty('personal_cues_patch');
  });

  it('caps workout_cues_patch text fields for conciseness', () => {
    const patch = cueProps.workout_cues_patch as {
      properties?: Record<string, { maxLength?: number }>;
    };
    for (const key of ['instructions', 'form_cues', 'tips', 'injury_prevention_tips'] as const) {
      expect(patch.properties?.[key]?.maxLength).toBe(WORKOUT_CUE_FIELD_MAX_CHARS);
    }
  });

  it('caps reply_content on cue-only schema', () => {
    const reply = cueProps.reply_content as { maxLength?: number };
    expect(reply.maxLength).toBe(COACH_CUE_REPLY_CONTENT_MAX_CHARS);
  });
});

describe('COACH_RESPONSE_SCHEMA personal_cues_patch', () => {
  const fullProps = COACH_RESPONSE_SCHEMA.properties as Record<string, unknown>;

  it('limits personal_cues_patch to one exercise per turn', () => {
    const patch = fullProps.personal_cues_patch as { maxItems?: number };
    expect(patch.maxItems).toBe(1);
  });

  it('caps personal_cues_patch text fields at 1000 chars', () => {
    const patch = fullProps.personal_cues_patch as {
      items?: { properties?: Record<string, { maxLength?: number }> };
    };
    for (const key of ['instructions', 'form_cues', 'tips', 'injury_prevention_tips'] as const) {
      expect(patch.items?.properties?.[key]?.maxLength).toBe(PERSONAL_CUES_FIELD_MAX_CHARS);
    }
  });

  it('caps full-schema workout_cues_patch text fields at 1000 chars', () => {
    const patch = fullProps.workout_cues_patch as {
      properties?: Record<string, { maxLength?: number }>;
    };
    for (const key of ['instructions', 'form_cues', 'tips', 'injury_prevention_tips'] as const) {
      expect(patch.properties?.[key]?.maxLength).toBe(WORKOUT_CUE_FIELD_MAX_CHARS);
    }
  });
});
