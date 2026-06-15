import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreparedWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';

const mockCallVertexAI = vi.hoisted(() => vi.fn());

vi.mock('@/lib/workout-factory/vertex-ai-client', () => ({
  callVertexAI: mockCallVertexAI,
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
  tabataBalancedMode: false,
};

function validFilledJson(): string {
  return JSON.stringify({
    blocks: [
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 16,
          is_alternating: true,
        },
        exercises: [
          { name: 'Kettlebell Swing', reps: '12', work_seconds: 45, rest_seconds: 15 },
          { name: 'Goblet Squat', reps: '10', work_seconds: 45, rest_seconds: 15 },
        ],
      },
    ],
  });
}

function invalidFilledJson(): string {
  return JSON.stringify({
    blocks: [
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
    tabataBalancedOptions: undefined,
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
    mockCallVertexAI.mockReset();
  });

  it('succeeds on first attempt without retry', async () => {
    mockCallVertexAI.mockResolvedValueOnce(validFilledJson());

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    expect(mockCallVertexAI).toHaveBeenCalledTimes(1);
  });

  it('retries with error feedback when first attempt fails validation', async () => {
    mockCallVertexAI
      .mockResolvedValueOnce(invalidFilledJson())
      .mockResolvedValueOnce(validFilledJson());

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    expect(mockCallVertexAI).toHaveBeenCalledTimes(2);
    const secondCall = mockCallVertexAI.mock.calls[1]?.[0] as { userPrompt?: string };
    expect(secondCall.userPrompt).toContain('PREVIOUS ATTEMPT REJECTED');
    expect(secondCall.userPrompt).toMatch(/sets, reps, or work_seconds/);
  });

  it('returns 422 when both attempts fail validation', async () => {
    mockCallVertexAI
      .mockResolvedValueOnce(invalidFilledJson())
      .mockResolvedValueOnce(invalidFilledJson());

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.response.status).toBe(422);
    expect(mockCallVertexAI).toHaveBeenCalledTimes(MAX_FILL_ATTEMPTS);
    const body = (await out.response.json()) as {
      error?: string;
      validation_error?: string;
    };
    expect(body.error).toBe('OUTLINE_FILL_VALIDATION_FAILED');
    expect(body.validation_error).toMatch(/sets, reps, or work_seconds/);
  });

  it('retries after parse error and succeeds on second attempt', async () => {
    mockCallVertexAI
      .mockResolvedValueOnce('not valid json {{{')
      .mockResolvedValueOnce(validFilledJson());

    const out = await runGenerateWorkoutOutlineFill(buildPreparedRequest(), creds, false);

    expect(out.ok).toBe(true);
    expect(mockCallVertexAI).toHaveBeenCalledTimes(2);
  });
});
