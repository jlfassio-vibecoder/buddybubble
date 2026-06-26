import { describe, expect, it } from 'vitest';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import {
  buildFillParametricOutlinePrompt,
  FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT,
  validateFillParametricOutlineOutput,
} from '@/lib/workout-factory/prompt-chain/fill-parametric-outline';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';

describe('FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT', () => {
  it('includes interval circuit cardinality guidance', () => {
    expect(FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT).toContain('INTERVAL CIRCUIT CARDINALITY');
    expect(FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT).toContain('distinct movement name');
  });
});

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

const circuitOutline = [
  {
    name: 'Main Circuit',
    block_format: 'circuit',
    format_params: { rounds: 3, rest_between_rounds_seconds: 60 },
    exercises: [{ name: 'Push-up' }, { name: 'Squat' }, { name: 'Row' }],
  },
];

const straightSetsOutline = [
  {
    name: 'Main Strength',
    block_format: 'straight_sets',
    format_params: { rest_between_sets_seconds: 90 },
    exercises: [{ name: 'Back Squat' }],
  },
];

const tabataOutline = [
  {
    name: 'Finisher Tabata',
    block_format: 'tabata',
    format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
    exercises: [{ name: 'Burpee' }],
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

describe('buildFillParametricOutlinePrompt', () => {
  it('includes fill-only output example without structural echo in output format', () => {
    const prompt = buildFillParametricOutlinePrompt(minimalPersona, emomOutline, ['Dumbbells']);
    expect(prompt).toContain('"instructions"');
    expect(prompt).toContain('Do NOT echo block names');
    expect(prompt).toMatch(/OUTPUT FORMAT[\s\S]*"exercises"/);
  });
});

describe('validateFillParametricOutlineOutput', () => {
  it('accepts valid fill preserving structure', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = {
      blocks: [
        {
          exercises: [
            { name: 'Kettlebell Swing', reps: '12', work_seconds: 45, rest_seconds: 15 },
            { name: 'Goblet Squat', reps: '10', work_seconds: 45, rest_seconds: 15 },
          ],
        },
      ],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.data.blocks[0]?.name).toBe('Main EMOM');
      expect(v.data.blocks[0]?.exercises).toHaveLength(2);
    }
  });

  it('accepts numeric reps without sets (circuit / AMRAP model shape)', () => {
    const preflight = preflightOutlineBlocks(circuitOutline).blocks;
    const filled = {
      blocks: [
        {
          exercises: [
            { name: 'Push-up', reps: 12 },
            { name: 'Goblet Squat', reps: 15 },
            { name: 'Dumbbell Row', reps: 10 },
          ],
        },
      ],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.data.blocks[0]?.exercises?.[0]?.reps).toBe('12');
    }
  });

  it('accepts EMOM name-only exercises when format_params carry timing', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = {
      blocks: [{ exercises: [{ name: 'Kettlebell Swing' }, { name: 'Goblet Squat' }] }],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
  });

  it('accepts Tabata name-only exercises when format_params carry rounds', () => {
    const preflight = preflightOutlineBlocks(tabataOutline).blocks;
    const filled = {
      blocks: [{ exercises: [{ name: 'Burpee' }] }],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
  });

  it('rejects straight_sets name-only exercises', () => {
    const preflight = preflightOutlineBlocks(straightSetsOutline).blocks;
    const filled = {
      blocks: [{ exercises: [{ name: 'Back Squat' }] }],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.error).toMatch(/needs sets, reps, or work_seconds/);
  });

  it('ignores model format_params drift and uses preflight params', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = {
      blocks: [
        {
          name: 'Renamed EMOM',
          block_format: 'emom',
          format_params: { interval_seconds: 90, total_minutes: 16, is_alternating: true },
          exercises: [
            { name: 'Swing', reps: '12' },
            { name: 'Squat', reps: '10' },
          ],
        },
      ],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.data.blocks[0]?.name).toBe('Main EMOM');
      expect((v.data.blocks[0]?.format_params as Record<string, unknown>)?.interval_seconds).toBe(
        60,
      );
    }
  });

  it('rejects changed block count', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const v = validateFillParametricOutlineOutput({ blocks: [] }, preflight);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.error).toMatch(/non-empty/);
  });

  it('accepts valid fill when preflight includes instruction + exercise blocks', () => {
    const raw = [{ name: 'Warm-up', instructions: ['5 min bike'] }, ...emomOutline];
    const preflight = preflightOutlineBlocks(raw).blocks;
    const filled = {
      blocks: [
        { instructions: ['5 min easy bike', 'Dynamic prep'] },
        {
          exercises: [
            { name: 'Kettlebell Swing', reps: '12', work_seconds: 45 },
            { name: 'Goblet Squat', reps: '10', work_seconds: 45 },
          ],
        },
      ],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
  });

  it('rejects when AI adds exercises to instruction-only block', () => {
    const raw = [{ name: 'Warm-up', instructions: ['5 min bike'] }, ...emomOutline];
    const preflight = preflightOutlineBlocks(raw).blocks;
    const filled = {
      blocks: [
        {
          instructions: ['5 min bike'],
          exercises: [{ name: 'Bike', reps: '5 min' }],
        },
        {
          exercises: [
            { name: 'Swing', reps: '12', work_seconds: 45 },
            { name: 'Squat', reps: '10', work_seconds: 45 },
          ],
        },
      ],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.error).toMatch(/instruction-only shape changed/);
  });
});
