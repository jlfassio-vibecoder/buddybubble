import { describe, expect, it } from 'vitest';
import {
  assertFillPreservesStructure,
  hydrateAndValidateOutlineBlocks,
  preflightOutlineBlocks,
} from '@/lib/workout-factory/outline-block-preflight';

const emomOutline = [
  {
    name: 'Main EMOM',
    block_format: 'emom',
    format_params: {
      interval_seconds: 60,
      total_minutes: 16,
      is_alternating: true,
    },
    exercises: [{ name: 'Swing' }, { name: 'Squat' }, { name: 'Push-up' }],
  },
];

describe('preflightOutlineBlocks', () => {
  it('normalizes valid EMOM outline blocks', () => {
    const { blocks, drops } = preflightOutlineBlocks(emomOutline);
    expect(drops).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.block_format).toBe('emom');
  });

  it('drops blocks with unknown block_format', () => {
    const { blocks, drops } = preflightOutlineBlocks([
      { name: 'Bad', block_format: 'not_real', exercises: [{ name: 'X' }] },
    ]);
    expect(blocks).toHaveLength(0);
    expect(drops.length).toBeGreaterThan(0);
  });

  it('accepts circuit outline with single Phase B exercise placeholder', () => {
    const { blocks, drops } = preflightOutlineBlocks([
      {
        name: 'Main Circuit',
        block_format: 'circuit',
        format_params: { rounds: 3 },
        exercises: [{ name: 'Goblet Squat' }],
      },
    ]);
    expect(drops).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.exercises).toHaveLength(3);
  });

  it('accepts mixed warmup instruction + parametric main outline', () => {
    const { blocks, drops } = preflightOutlineBlocks([
      {
        name: 'Warm-up',
        instructions: ['5 min bike', 'Dynamic prep'],
      },
      ...emomOutline,
    ]);
    expect(drops).toEqual([]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.instructions).toEqual(['5 min bike', 'Dynamic prep']);
    expect(blocks[0]?.block_format).toBeUndefined();
    expect(blocks[1]?.block_format).toBe('emom');
  });
});

describe('hydrateAndValidateOutlineBlocks', () => {
  it('injects alternating_stations for EMOM is_alternating blocks', () => {
    const filled = [
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 16,
          is_alternating: true,
        },
        exercises: [
          { name: 'Swing', reps: '12', work_seconds: 45, rest_seconds: 15 },
          { name: 'Squat', reps: '10', work_seconds: 45, rest_seconds: 15 },
          { name: 'Push-up', reps: '8', work_seconds: 45, rest_seconds: 15 },
        ],
      },
    ];
    const { blocks, drops } = hydrateAndValidateOutlineBlocks(filled);
    expect(drops).toEqual([]);
    expect(blocks).toHaveLength(1);
    const fp = blocks[0]?.format_params as Record<string, unknown>;
    expect(fp?.alternating_stations).toEqual([[0], [1], [2]]);
  });

  it('passes instruction-only blocks without block_format', () => {
    const filled = [
      {
        name: 'Warm-up',
        instructions: ['5 min easy bike', 'Dynamic prep'],
      },
    ];
    const { blocks, drops } = hydrateAndValidateOutlineBlocks(filled);
    expect(drops).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.name).toBe('Warm-up');
    expect(blocks[0]?.instructions).toEqual(['5 min easy bike', 'Dynamic prep']);
    expect(blocks[0]?.block_format).toBeUndefined();
  });

  it('preserves block count for mixed instruction + EMOM fill pipeline', () => {
    const raw = [{ name: 'Warm-up', instructions: ['5 min bike'] }, ...emomOutline];
    const preflight = preflightOutlineBlocks(raw).blocks;
    const vertexFill = [
      { name: 'Warm-up', instructions: ['5 min easy bike', 'Arm circles'] },
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: emomOutline[0]!.format_params,
        exercises: [
          { name: 'Swing', reps: '12', work_seconds: 45 },
          { name: 'Squat', reps: '10', work_seconds: 45 },
          { name: 'Push-up', reps: '8', work_seconds: 45 },
        ],
      },
    ];
    const { blocks, drops } = hydrateAndValidateOutlineBlocks(vertexFill);
    expect(drops).toEqual([]);
    expect(blocks).toHaveLength(preflight.length);
  });
});

describe('assertFillPreservesStructure', () => {
  it('returns null when structure matches', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = [
      {
        ...emomOutline[0],
        exercises: [
          { name: 'Swing', reps: '12', work_seconds: 45 },
          { name: 'Squat', reps: '10', work_seconds: 45 },
          { name: 'Push-up', reps: '8', work_seconds: 45 },
        ],
      },
    ];
    expect(assertFillPreservesStructure(preflight, filled)).toBeNull();
  });

  it('rejects changed format_params', () => {
    const preflight = preflightOutlineBlocks(emomOutline).blocks;
    const filled = [
      {
        ...emomOutline[0],
        format_params: { interval_seconds: 60, total_minutes: 20, is_alternating: true },
        exercises: [{ name: 'Swing', reps: '12' }],
      },
    ];
    expect(assertFillPreservesStructure(preflight, filled)).toMatch(/format_params changed/);
  });
});
