import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreparedWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import { OUTLINE_FILL_MAX_OUTPUT_TOKENS } from '@/lib/workout-factory/outline-fill-config';

const mockCallVertexAIWithMetadata = vi.hoisted(() => vi.fn());
const mockCallVertexAI = vi.hoisted(() => vi.fn());

vi.mock('@/lib/workout-factory/vertex-ai-client', () => ({
  callVertexAIWithMetadata: mockCallVertexAIWithMetadata,
  callVertexAI: mockCallVertexAI,
}));

vi.mock('@/lib/supabase-service-role', () => ({
  createServiceRoleClient: () => {
    throw new Error('service_role_unavailable_in_test');
  },
}));

import {
  MAX_FILL_ATTEMPTS,
  runGenerateWorkoutOutlineFill,
} from '@/lib/workout-factory/generate-workout-outline-fill-runner';

const emomOutline = [
  {
    name: 'Main EMOM',
    block_format: 'emom',
    format_params: {
      interval_seconds: 60,
      total_minutes: 16,
      is_alternating: true,
    },
    exercises: [{ name: 'Swing' }, { name: 'Squat' }],
  },
];

const minimalPersona: WorkoutPersona = {
  title: 'Test',
  description: 'Session',
  splitType: 'full_body',
  lifestyle: 'active',
  weeklyTimeMinutes: 180,
  sessionsPerWeek: 3,
  sessionDurationMinutes: 45,
  twoADay: false,
  demographics: {
    ageRange: '30-39',
    sex: 'any',
    weight: 165,
    experienceLevel: 'intermediate',
  },
  medical: { injuries: '', conditions: '' },
  goals: { primary: 'General fitness', secondary: '' },
  hiitMode: false,
  amrapDensityMode: false,
  intervalBalancedMode: false,
};

function vertexResult(content: string, finishReason = 'stop', completionTokens = 120) {
  return {
    content,
    finishReason,
    usage: {
      promptTokens: 500,
      completionTokens,
      totalTokens: 500 + completionTokens,
    },
  };
}

function invalidFilledJson(): string {
  return JSON.stringify({
    blocks: [{ exercises: [{ name: 'Kettlebell Swing' }] }],
  });
}

function validFillOnlyJson(): string {
  return JSON.stringify({
    blocks: [
      {
        exercises: [
          { name: 'Kettlebell Swing', reps: '12', work_seconds: 45, rest_seconds: 15 },
          { name: 'Goblet Squat', reps: '10', work_seconds: 45, rest_seconds: 15 },
        ],
      },
    ],
  });
}

function buildPreparedRequest(): PreparedWorkoutChainRequest {
  return {
    persona: minimalPersona,
    blockOptions: {
      includeWarmup: true,
      mainBlockCount: 1,
      includeFinisher: false,
      includeCooldown: false,
    },
    hiitOptions: undefined,
    hiitMode: false,
    amrapDensityOptions: undefined,
    intervalBalancedOptions: undefined,
    zoneContext: undefined,
    availableEquipment: ['Dumbbells'],
    providedArchitect: undefined,
    step1UserPromptOverride: undefined,
    coachWorkoutOutline: emomOutline,
  };
}

const creds = { projectId: 'p', region: 'r', accessToken: 't' };

describe('runGenerateWorkoutOutlineFill', () => {
  beforeEach(() => {
    mockCallVertexAIWithMetadata.mockReset();
    mockCallVertexAI.mockReset();
    mockCallVertexAI.mockRejectedValue(new Error('enrich not configured in unit test'));
  });

  it('succeeds on first attempt without retry', async () => {
    mockCallVertexAIWithMetadata.mockResolvedValueOnce(vertexResult(validFillOnlyJson()));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    expect(mockCallVertexAIWithMetadata).toHaveBeenCalledTimes(1);
    expect(mockCallVertexAIWithMetadata.mock.calls[0]?.[0]?.maxTokens).toBe(
      OUTLINE_FILL_MAX_OUTPUT_TOKENS,
    );
    if (out.ok) {
      expect(out.telemetry.pipeline).toBe('parametric_outline_fill');
      expect(out.telemetry.outlineBlockCount).toBe(1);
      expect(out.telemetry.exerciseCount).toBe(2);
      expect(out.data.chain_metadata.pipeline).toBe('parametric_outline_fill');
      if (out.data.chain_metadata.pipeline === 'parametric_outline_fill') {
        expect(out.data.chain_metadata.enrich_workout_biomechanics).toBeNull();
      }
    }
  });

  it('stamps Stage 2 enrich cues onto factory exercises when enrich succeeds', async () => {
    mockCallVertexAIWithMetadata.mockResolvedValueOnce(vertexResult(validFillOnlyJson()));
    mockCallVertexAI.mockResolvedValueOnce(
      JSON.stringify({
        exercises: [
          {
            order: 1,
            exercise_name: 'Kettlebell Swing',
            detailed_instructions: 'Hinge hard',
            biomechanical_cues: 'Snap hips',
            injury_prevention_tips: 'Soft knees',
          },
          {
            order: 2,
            exercise_name: 'Goblet Squat',
            detailed_instructions: 'Elbows inside knees',
            biomechanical_cues: 'Brace',
          },
        ],
      }),
    );

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(mockCallVertexAI).toHaveBeenCalledTimes(1);
    const main = out.data.workoutSet.workouts[0]?.exerciseBlocks?.[0]?.exercises ?? [];
    expect(main[0]?.instructions).toBe('Hinge hard');
    expect(main[0]?.formCues).toBe('Snap hips');
    expect(main[0]?.injuryPreventionTips).toBe('Soft knees');
    expect(main[1]?.instructions).toBe('Elbows inside knees');
    expect(main[1]?.formCues).toBe('Brace');
    expect(out.data.taskExercises?.[0]?.instructions).toBe('Hinge hard');
    expect(out.data.taskExercises?.[0]?.form_cues).toBe('Snap hips');
    if (out.data.chain_metadata.pipeline === 'parametric_outline_fill') {
      expect(out.data.chain_metadata.enrich_workout_biomechanics?.exercises).toHaveLength(2);
    }
  });

  it('retries with error feedback when first attempt fails validation', async () => {
    mockCallVertexAIWithMetadata
      .mockResolvedValueOnce(vertexResult(invalidFilledJson()))
      .mockResolvedValueOnce(vertexResult(validFillOnlyJson()));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    expect(mockCallVertexAIWithMetadata).toHaveBeenCalledTimes(2);
    const secondCall = mockCallVertexAIWithMetadata.mock.calls[1]?.[0] as {
      userPrompt?: string;
    };
    expect(secondCall.userPrompt).toContain('PREVIOUS ATTEMPT REJECTED');
    expect(secondCall.userPrompt).toMatch(/exercise count/);
  });

  it('succeeds via deterministic fallback when both attempts fail validation', async () => {
    mockCallVertexAIWithMetadata
      .mockResolvedValueOnce(vertexResult(invalidFilledJson()))
      .mockResolvedValueOnce(vertexResult(invalidFilledJson()));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(mockCallVertexAIWithMetadata).toHaveBeenCalledTimes(MAX_FILL_ATTEMPTS);
    expect(out.telemetry.fillFallback).toBe(true);
    expect(out.data.chain_metadata.pipeline).toBe('parametric_outline_fill');
    if (out.data.chain_metadata.pipeline !== 'parametric_outline_fill') return;
    expect(out.data.chain_metadata.fill_fallback).toBe(true);
    expect(out.data.workoutSet.workouts[0]?.exerciseBlocks).toHaveLength(1);
  });

  it('returns 422 when both attempts fail and deterministic fallback is disabled', async () => {
    const prev = process.env.OUTLINE_FILL_DETERMINISTIC_FALLBACK;
    process.env.OUTLINE_FILL_DETERMINISTIC_FALLBACK = 'false';

    mockCallVertexAIWithMetadata
      .mockResolvedValueOnce(vertexResult(invalidFilledJson()))
      .mockResolvedValueOnce(vertexResult(invalidFilledJson()));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    if (prev === undefined) delete process.env.OUTLINE_FILL_DETERMINISTIC_FALLBACK;
    else process.env.OUTLINE_FILL_DETERMINISTIC_FALLBACK = prev;

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.response.status).toBe(422);
    expect(out.telemetry.fillFallback).toBeUndefined();
  });

  it('succeeds via deterministic fallback when both attempts fail to parse', async () => {
    mockCallVertexAIWithMetadata
      .mockResolvedValueOnce(vertexResult('not valid json {{{'))
      .mockResolvedValueOnce(vertexResult('still not json {{{'));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.telemetry.fillFallback).toBe(true);
    expect(out.data.chain_metadata.pipeline).toBe('parametric_outline_fill');
    if (out.data.chain_metadata.pipeline !== 'parametric_outline_fill') return;
    expect(out.data.chain_metadata.fill_fallback).toBe(true);
  });

  it('retries after parse error and succeeds on second attempt', async () => {
    mockCallVertexAIWithMetadata
      .mockResolvedValueOnce(vertexResult('not valid json {{{'))
      .mockResolvedValueOnce(vertexResult(validFillOnlyJson()));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    expect(mockCallVertexAIWithMetadata).toHaveBeenCalledTimes(2);
  });

  it('adds compact-output hint on retry after length truncation', async () => {
    mockCallVertexAIWithMetadata
      .mockResolvedValueOnce(
        vertexResult('not valid json {{{', 'length', OUTLINE_FILL_MAX_OUTPUT_TOKENS),
      )
      .mockResolvedValueOnce(vertexResult(validFillOnlyJson()));

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    const secondCall = mockCallVertexAIWithMetadata.mock.calls[1]?.[0] as {
      userPrompt?: string;
    };
    expect(secondCall.userPrompt).toMatch(/Keep output compact/);
    if (out.ok) expect(out.telemetry.truncated).toBe(true);
  });
});
