import { describe, expect, it } from 'vitest';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { mapCoachBlocksToCanvas, mapCoachProposedToCanvasBlocks } from './coach-block-mapper';

describe('mapCoachBlocksToCanvas', () => {
  it('maps tabata wire block to camelCase canvas fields', () => {
    const views = mapCoachBlocksToCanvas([
      {
        name: 'Intervals',
        block_format: 'tabata',
        format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
        exercises: [{ name: 'Burpee', sets: 1, reps: '10', work_seconds: 20, rest_seconds: 10 }],
      },
    ]);

    expect(views).toHaveLength(1);
    const block = views[0]!;
    expect(block.section).toBe('main');
    expect(block.blockFormat).toBe('tabata');
    expect(block.formatParams).toEqual({ rounds: 8, work_seconds: 20, rest_seconds: 10 });
    expect(block.exercises[0]?.exerciseName).toBe('Burpee');
    expect(block.exercises[0]?.workSeconds).toBe(20);
    expect(block).not.toHaveProperty('block_format');
    expect(JSON.stringify(block)).not.toContain('block_format');
  });

  it('maps emom wire block with exerciseName camelCase', () => {
    const views = mapCoachBlocksToCanvas([
      {
        name: 'EMOM Strength',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 12 },
        exercises: [{ name: 'Deadlift', sets: 1, reps: '5' }],
      },
    ]);

    expect(views[0]?.blockFormat).toBe('emom');
    expect(views[0]?.exercises[0]?.exerciseName).toBe('Deadlift');
    expect(views[0]?.formatParams).toEqual({ interval_seconds: 60, total_minutes: 12 });
  });

  it('maps instruction-only warm-up to warmup section', () => {
    const views = mapCoachBlocksToCanvas([
      {
        name: 'Warm-up',
        instructions: ['Jumping jacks', 'Arm circles'],
      },
    ]);

    expect(views).toHaveLength(1);
    expect(views[0]?.section).toBe('warmup');
    expect(views[0]?.blockFormat).toBeNull();
    expect(views[0]?.exercises).toEqual([]);
    expect(views[0]?.instructions).toEqual(['Jumping jacks', 'Arm circles']);
  });
});

describe('mapCoachProposedToCanvasBlocks', () => {
  it('merges proposed delta into rich base and returns full canvas blocks', () => {
    const base = richMetadataWithBlockFormat('emom') as Json;
    const proposed = {
      blocks: [
        {
          name: 'MAIN',
          block_format: 'tabata',
          format_params: { rounds: 6, work_seconds: 30, rest_seconds: 15 },
          exercises: [
            { name: 'Goblet Squat', sets: 1, reps: '10' },
            { name: 'Push Press', sets: 1, reps: '10' },
            { name: 'Row', sets: 1, reps: '10' },
          ],
        },
      ],
    };

    const blocks = mapCoachProposedToCanvasBlocks({ proposed, baseMetadata: base });
    expect(blocks.length).toBeGreaterThan(0);
    const main = blocks.find((b) => b.section === 'main');
    expect(main?.blockFormat).toBe('tabata');
    expect(main?.exercises.some((e) => e.exerciseName === 'Goblet Squat')).toBe(true);
    expect(JSON.stringify(blocks)).not.toContain('"block_format"');
  });
});
