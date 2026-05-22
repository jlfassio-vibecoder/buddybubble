import { describe, expect, it } from 'vitest';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildEmomAlternatingCoachGuide } from '@/lib/workout-factory/build-emom-alternating-coach-guide';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';

describe('buildEmomAlternatingCoachGuide', () => {
  it('returns null for legacy EMOM (no is_alternating)', () => {
    const metadata = richMetadataWithBlockFormat('emom');
    const vm = buildWorkoutSessionViewModel(metadata);
    expect(buildEmomAlternatingCoachGuide(vm.blocks, vm.flatExercises)).toBeNull();
  });

  it('returns null for tabata workouts', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(metadata);
    expect(buildEmomAlternatingCoachGuide(vm.blocks, vm.flatExercises)).toBeNull();
  });

  it('maps A/B/C 10-min cycle to correct global minutes and set indices', () => {
    const metadata = richAlternatingEmomMetadata({
      totalRounds: 10,
      cycle: [[0], [1], [2]],
      exerciseNames: ['Deadlift', 'Push-up', 'Air Squat'],
    });
    const vm = buildWorkoutSessionViewModel(metadata);
    const guide = buildEmomAlternatingCoachGuide(vm.blocks, vm.flatExercises);
    expect(guide).not.toBeNull();
    expect(guide!.length).toBe(1);

    const block = guide![0];
    expect(block.cycle_taxonomy).toBe('A / B / C');
    expect(block.exercises).toHaveLength(3);

    const deadlift = block.exercises.find((e) => e.name === 'Deadlift')!;
    expect(deadlift.exerciseIndex).toBe(0);
    expect(deadlift.global_minutes).toEqual([0, 3, 6, 9]);
    expect(deadlift.set_indices).toEqual([0, 1, 2, 3]);

    const pushUp = block.exercises.find((e) => e.name === 'Push-up')!;
    expect(pushUp.exerciseIndex).toBe(1);
    expect(pushUp.global_minutes).toEqual([1, 4, 7]);
    expect(pushUp.set_indices).toEqual([0, 1, 2]);

    const squat = block.exercises.find((e) => e.name === 'Air Squat')!;
    expect(squat.exerciseIndex).toBe(2);
    expect(squat.global_minutes).toEqual([2, 5, 8]);
    expect(squat.set_indices).toEqual([0, 1, 2]);
  });

  it('offsets global exerciseIndex when a prior main block precedes alternating EMOM', () => {
    const base = richAlternatingEmomMetadata({
      totalRounds: 6,
      cycle: [[0], [1]],
      exerciseNames: ['Goblet Squat', 'Push-up'],
    });
    const factory = base.ai_workout_factory as {
      workout_set: { workouts: object[] };
    };
    const ws = factory.workout_set;
    const session = ws.workouts[0] as {
      exerciseBlocks: object[];
      title: string;
      description: string;
    };
    const metadata = {
      ...base,
      ai_workout_factory: {
        ...factory,
        workout_set: {
          ...ws,
          workouts: [
            {
              ...session,
              exerciseBlocks: [
                {
                  order: 1,
                  name: 'Strength',
                  blockFormat: 'straight_sets',
                  formatParams: { sets: 3 },
                  exercises: [
                    {
                      order: 1,
                      exerciseName: 'Bench Press',
                      sets: 3,
                      reps: '8',
                    },
                  ],
                },
                ...session.exerciseBlocks,
              ],
            },
          ],
        },
      },
    };
    const vm = buildWorkoutSessionViewModel(metadata);
    const guide = buildEmomAlternatingCoachGuide(vm.blocks, vm.flatExercises)!;
    expect(guide).not.toBeNull();
    const emomBlock = guide.find((b) => b.cycle_taxonomy === 'A / B')!;
    expect(emomBlock.exercises[0].exerciseIndex).toBe(1);
    expect(emomBlock.exercises[0].name).toBe('Goblet Squat');
    expect(emomBlock.exercises[1].exerciseIndex).toBe(2);
  });
});
