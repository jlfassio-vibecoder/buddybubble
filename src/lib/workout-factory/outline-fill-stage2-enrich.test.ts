import { describe, expect, it } from 'vitest';
import {
  applyEnrichToOutlineHydratedBlocks,
  outlineHydratedBlocksToEnrichExtract,
} from '@/lib/workout-factory/outline-fill-stage2-enrich';

describe('outline-fill-stage2-enrich helpers', () => {
  it('builds extract rows in block traversal order', () => {
    const extract = outlineHydratedBlocksToEnrichExtract(
      [
        {
          name: 'Main',
          block_format: 'straight_sets',
          exercises: [
            { name: 'Swing', reps: '12' },
            { name: 'Squat', reps: '10' },
          ],
        },
      ],
      'Test',
    );
    expect(extract.exercises).toEqual([
      { order: 1, section: 'main', exercise_name: 'Swing', reps: '12' },
      { order: 2, section: 'main', exercise_name: 'Squat', reps: '10' },
    ]);
  });

  it('stamps enrich fields onto hydrated exercise rows', () => {
    const blocks = [
      {
        name: 'Main',
        exercises: [
          { name: 'Swing', reps: '12' },
          { name: 'Squat', reps: '10' },
        ],
      },
    ];
    applyEnrichToOutlineHydratedBlocks(blocks, {
      exercises: [
        {
          order: 1,
          exercise_name: 'Swing',
          detailed_instructions: 'Hinge',
          biomechanical_cues: ['Snap'],
          injury_prevention_tips: 'Soft knees',
        },
        {
          order: 2,
          exercise_name: 'Squat',
          detailed_instructions: ['Sit back'],
          biomechanical_cues: 'Brace',
        },
      ],
    });
    expect(blocks[0]!.exercises[0]).toMatchObject({
      instructions: 'Hinge',
      form_cues: 'Snap',
      injury_prevention_tips: 'Soft knees',
    });
    expect(blocks[0]!.exercises[1]).toMatchObject({
      instructions: 'Sit back',
      form_cues: 'Brace',
    });
  });
});
