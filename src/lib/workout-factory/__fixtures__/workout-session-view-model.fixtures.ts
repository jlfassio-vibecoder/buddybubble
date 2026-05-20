import type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';

const baseExercises = [
  { order: 1, exerciseName: 'Goblet Squat', sets: 1, reps: '10' },
  { order: 2, exerciseName: 'Push Press', sets: 1, reps: '10' },
  { order: 3, exerciseName: 'Row', sets: 1, reps: '10' },
];

/** Minimal valid formatParams per closed-world format. */
export const FORMAT_PARAMS_BY_BLOCK: Record<BlockFormat, Record<string, unknown>> = {
  straight_sets: {},
  superset: { rounds: 3 },
  circuit: { rounds: 3 },
  amrap: { time_cap_minutes: 12 },
  emom: { interval_seconds: 60, total_minutes: 16 },
  tabata: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
  ladder: { start_reps: 1, peak_reps: 10, direction: 'ascending' },
  chipper: { rounds: 1 },
  pyramid: { start_reps: 5, peak_reps: 10, direction: 'ascending' },
  contrast: { rounds: 4 },
  clusters: { reps_per_cluster: 3, clusters: 4 },
  drop_sets: { drop_percent: 20, drops: 2 },
};

export function richMetadataWithBlockFormat(blockFormat: BlockFormat): Record<string, unknown> {
  const exerciseCount =
    blockFormat === 'superset' || blockFormat === 'contrast'
      ? 2
      : blockFormat === 'circuit' || blockFormat === 'chipper'
        ? 3
        : 1;
  const exercises = baseExercises.slice(0, exerciseCount);

  return {
    workout_type: 'Generated',
    exercises: exercises.map((e) => ({
      name: e.exerciseName,
      sets: e.sets,
      reps: e.reps,
    })),
    ai_workout_factory: {
      generated_at: '2026-06-01T00:00:00Z',
      model: 'test',
      workout_set: {
        title: 'Test set',
        description: 'Test',
        difficulty: 'intermediate',
        workouts: [
          {
            title: 'Session',
            description: 'Session',
            warmupBlocks: [
              {
                order: 1,
                exerciseName: 'Band pull-aparts',
                instructions: ['15 reps easy pace'],
              },
            ],
            exerciseBlocks: [
              {
                order: 1,
                name: 'MAIN',
                blockFormat,
                formatParams: FORMAT_PARAMS_BY_BLOCK[blockFormat],
                exercises,
              },
            ],
            finisherBlocks: [
              {
                order: 1,
                exerciseName: 'Plank',
                instructions: ['60s hold'],
              },
            ],
            cooldownBlocks: [
              {
                order: 1,
                exerciseName: 'Child pose',
                instructions: ['Breathe slowly'],
              },
            ],
          },
        ],
      },
    },
  };
}

export const SUBTITLE_SNIPPETS: Record<BlockFormat, string | null> = {
  straight_sets: null,
  superset: 'Superset',
  circuit: 'Circuit',
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  ladder: 'Ladder',
  chipper: 'Chipper',
  pyramid: 'Pyramid',
  contrast: 'Contrast',
  clusters: 'Clusters',
  drop_sets: 'Drop sets',
};
