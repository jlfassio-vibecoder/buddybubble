import { describe, expect, it } from 'vitest';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import { validateFillParametricOutlineOutput } from '@/lib/workout-factory/prompt-chain/fill-parametric-outline';

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
});
