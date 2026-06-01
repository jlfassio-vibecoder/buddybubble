import { describe, expect, it } from 'vitest';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import {
  buildFillParametricOutlinePrompt,
  validateFillParametricOutlineOutput,
} from '@/lib/workout-factory/prompt-chain/fill-parametric-outline';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';

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

describe('buildFillParametricOutlinePrompt', () => {
  it('includes instruction-only output example', () => {
    const prompt = buildFillParametricOutlinePrompt(minimalPersona, emomOutline, ['Dumbbells']);
    expect(prompt).toContain('"name": "Warm-up"');
    expect(prompt).toContain('"instructions"');
    expect(prompt).toContain('must NOT include block_format');
  });
});

describe('validateFillParametricOutlineOutput', () => {
  it('accepts valid fill preserving structure', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = {
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
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.data.blocks[0]?.exercises).toHaveLength(2);
    }
  });

  it('rejects changed block count', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const v = validateFillParametricOutlineOutput({ blocks: [] }, preflight);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.error).toMatch(/non-empty/);
  });

  it('rejects exercises without prescription fields', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = {
      blocks: [
        {
          ...emomOutline[0],
          exercises: [{ name: 'Swing' }, { name: 'Squat' }],
        },
      ],
    };
    const v = validateFillParametricOutlineOutput(filled, preflight);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.error).toMatch(/sets, reps, or work_seconds/);
  });

  it('rejects mutated format_params', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = {
      blocks: [
        {
          name: 'Main EMOM',
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
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.error).toMatch(/format_params/);
  });

  it('accepts valid fill when preflight includes instruction + exercise blocks', () => {
    const raw = [{ name: 'Warm-up', instructions: ['5 min bike'] }, ...emomOutline];
    const preflight = preflightOutlineBlocks(raw).blocks;
    const filled = {
      blocks: [
        { name: 'Warm-up', instructions: ['5 min easy bike', 'Dynamic prep'] },
        {
          name: 'Main EMOM',
          block_format: 'emom',
          format_params: emomOutline[0]!.format_params,
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
          name: 'Warm-up',
          instructions: ['5 min bike'],
          exercises: [{ name: 'Bike', reps: '5 min' }],
        },
        {
          name: 'Main EMOM',
          block_format: 'emom',
          format_params: emomOutline[0]!.format_params,
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
