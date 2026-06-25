import { describe, expect, it } from 'vitest';
import { buildWorkoutInSetFromOutlineFill } from '@/lib/workout-factory/map-outline-fill-to-workout';
import { hydrateAndValidateOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';

const minimalPersona: WorkoutPersona = {
  title: 'Test Session',
  description: 'Daily check-in ready',
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

describe('buildWorkoutInSetFromOutlineFill', () => {
  it('routes warm-up instruction block to warmupBlocks', () => {
    const filled = [
      {
        name: 'Warm-up',
        instructions: ['5 min bike', 'Dynamic leg swings'],
      },
      {
        name: 'Strength',
        block_format: 'straight_sets',
        format_params: { sets: 3, reps: 10 },
        exercises: [{ name: 'Back Squat', sets: 3, reps: '8' }],
      },
    ];
    const { blocks } = hydrateAndValidateOutlineBlocks(filled);
    const workout = buildWorkoutInSetFromOutlineFill(blocks, minimalPersona);
    expect(workout.warmupBlocks).toHaveLength(1);
    expect(workout.warmupBlocks?.[0]?.exerciseName).toBe('Warm-up');
    expect(workout.exerciseBlocks).toHaveLength(1);
    expect(workout.exerciseBlocks?.[0]?.blockFormat).toBe('straight_sets');
  });

  it('preserves two exercise blocks without flattening to Main', () => {
    const blocks = [
      {
        name: 'Strength A',
        block_format: 'straight_sets',
        format_params: {},
        exercises: [{ name: 'Press', sets: 3, reps: '8' }],
      },
      {
        name: 'Finisher AMRAP',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 8 },
        exercises: [{ name: 'Burpee', reps: '10' }],
      },
    ];
    const workout = buildWorkoutInSetFromOutlineFill(blocks, minimalPersona);
    expect(workout.exerciseBlocks).toHaveLength(2);
    expect(workout.exerciseBlocks?.[0]?.name).toBe('Strength A');
    expect(workout.exerciseBlocks?.[1]?.blockFormat).toBe('amrap');
  });

  it('injects alternating_stations on EMOM alternating blocks', () => {
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
    const { blocks } = hydrateAndValidateOutlineBlocks(filled);
    const workout = buildWorkoutInSetFromOutlineFill(blocks, minimalPersona);
    const block = workout.exerciseBlocks?.[0];
    expect(block?.blockFormat).toBe('emom');
    expect(block?.formatParams?.alternating_stations).toEqual([[0], [1], [2]]);
  });
});
