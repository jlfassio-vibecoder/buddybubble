import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import type { Json } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { deriveFlatExercisesFromMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { useTaskWorkoutAi } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';

function richTabataFixture(): Record<string, unknown> {
  return {
    workout_type: 'Strength',
    duration_min: 45,
    exercises: [{ name: 'Legacy flat', sets: 1, reps: '5' }],
    ai_workout_factory: {
      generated_at: '2026-01-01T00:00:00Z',
      model: 'gemini-test',
      chain_metadata: { foo: 1 },
      workout_set: {
        title: 'Set title',
        description: 'Set desc',
        difficulty: 'intermediate',
        workouts: [
          {
            title: 'Session',
            description: 'Session desc',
            exerciseBlocks: [
              {
                name: 'MAIN',
                blockFormat: 'tabata',
                formatParams: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
                exercises: [
                  {
                    order: 1,
                    exerciseName: 'Kettlebell Sumo Deadlift',
                    sets: 3,
                    reps: '15',
                    rpe: 8,
                    restSeconds: 60,
                  },
                ],
              },
            ],
            cooldownBlocks: [
              {
                order: 1,
                exerciseName: 'Deep Squat Hold',
                instructions: ['Static stretch for hip openers.'],
              },
            ],
          },
        ],
      },
    },
  };
}

function getMainBlock(meta: Json): Record<string, unknown> {
  const af = (meta as Record<string, unknown>).ai_workout_factory as {
    workout_set: { workouts: Record<string, unknown>[] };
  };
  const blocks = af.workout_set.workouts[0].exerciseBlocks as Record<string, unknown>[];
  return blocks[0];
}

function useTaskWorkoutAiHarness(initialMeta: Json) {
  const [title, setTitle] = useState('Original Title');
  const [description, setDescription] = useState('Original description');
  const [workoutType, setWorkoutType] = useState('Strength');
  const [workoutDurationMin, setWorkoutDurationMin] = useState('45');
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>(
    deriveFlatExercisesFromMetadata(initialMeta),
  );
  const [metadata, setMetadata] = useState<Json>(initialMeta as Json);

  const hook = useTaskWorkoutAi({
    open: true,
    taskId: 'task-1',
    loading: false,
    initialOpenWorkoutViewer: false,
    canWrite: true,
    workspaceId: 'ws-1',
    isWorkoutItemType: true,
    title,
    description,
    workoutDurationMin,
    metadata,
    workoutExercises,
    setTitle,
    setDescription,
    setWorkoutType,
    setWorkoutDurationMin,
    setWorkoutExercises,
    setMetadata,
  });

  return { ...hook, title, description, metadata, workoutExercises };
}

describe('useTaskWorkoutAi handleWorkoutViewerApply', () => {
  it('preserves ai_workout_factory when exercises unchanged (title-only edit)', () => {
    const initialMeta = richTabataFixture() as Json;
    const derived = deriveFlatExercisesFromMetadata(initialMeta);

    const { result } = renderHook(() => useTaskWorkoutAiHarness(initialMeta));

    act(() => {
      result.current.handleWorkoutViewerApply({
        title: 'New Title',
        description: 'New description',
        exercises: derived,
      });
    });

    expect(result.current.title).toBe('New Title');
    expect(result.current.description).toBe('New description');

    const block = getMainBlock(result.current.metadata);
    expect(block.blockFormat).toBe('tabata');
    expect(block.name).toBe('MAIN');

    const af = (result.current.metadata as Record<string, unknown>).ai_workout_factory as Record<
      string,
      unknown
    >;
    expect(af.generated_at).toBe('2026-01-01T00:00:00Z');
    expect(af.chain_metadata).toEqual({ foo: 1 });

    const session = (af.workout_set as { workouts: Record<string, unknown>[] }).workouts[0];
    expect(session.cooldownBlocks).toHaveLength(1);
    const blocks = session.exerciseBlocks as Record<string, unknown>[];
    expect(blocks).toHaveLength(1);
  });

  it('degrades factory to straight_sets Main when exercise list changes', () => {
    const initialMeta = richTabataFixture() as Json;
    const derived = deriveFlatExercisesFromMetadata(initialMeta);
    const edited = derived.map((ex, i) => (i === 0 ? { ...ex, name: 'Edited Row', reps: 8 } : ex));

    const { result } = renderHook(() => useTaskWorkoutAiHarness(initialMeta));

    act(() => {
      result.current.handleWorkoutViewerApply({
        title: 'Original Title',
        description: 'Original description',
        exercises: edited,
      });
    });

    const block = getMainBlock(result.current.metadata);
    expect(block.blockFormat).toBe('straight_sets');
    expect(block.name).toBe('Main');
    const ex = (block.exercises as Record<string, unknown>[])[0];
    expect(ex.exerciseName).toBe('Edited Row');
  });

  it('flat-only metadata applies exercise edits without factory', () => {
    const flatMeta = {
      exercises: [{ name: 'Squat', sets: 3, reps: 10 }],
    } as Json;

    const { result } = renderHook(() => useTaskWorkoutAiHarness(flatMeta));

    act(() => {
      result.current.handleWorkoutViewerApply({
        title: 'Flat workout',
        description: '',
        exercises: [{ name: 'Squat', sets: 3, reps: 10 }],
      });
    });

    expect((result.current.metadata as Record<string, unknown>).ai_workout_factory).toBeUndefined();

    act(() => {
      result.current.handleWorkoutViewerApply({
        title: 'Flat workout',
        description: '',
        exercises: [{ name: 'Bench Press', sets: 3, reps: 8 }],
      });
    });

    const exercises = (result.current.metadata as Record<string, unknown>).exercises as {
      name: string;
    }[];
    expect(exercises[0].name).toBe('Bench Press');
  });

  it('applies rich block edits via applyBlockEditsToMetadata when blocks payload present', () => {
    const initialMeta = richTabataFixture() as Json;
    const vm = buildWorkoutSessionViewModel(initialMeta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const originalParams = main.formatParams;
    const editedBlocks = vm.blocks.map((b) =>
      b.id === main.id
        ? {
            ...b,
            exercises: b.exercises.map((ex, i) =>
              i === 0 ? { ...ex, exerciseName: 'Renamed Via Blocks' } : ex,
            ),
          }
        : b,
    );
    const staleFlat = deriveFlatExercisesFromMetadata(initialMeta);

    const { result } = renderHook(() => useTaskWorkoutAiHarness(initialMeta));

    act(() => {
      result.current.handleWorkoutViewerApply({
        title: 'Original Title',
        description: 'Original description',
        exercises: staleFlat,
        blocks: editedBlocks,
      });
    });

    const block = getMainBlock(result.current.metadata);
    expect(block.blockFormat).toBe('tabata');
    expect(block.formatParams).toEqual(originalParams);
    const ex = (block.exercises as Record<string, unknown>[])[0];
    expect(ex.exerciseName).toBe('Renamed Via Blocks');

    const flat = (result.current.metadata as Record<string, unknown>).exercises as {
      name: string;
    }[];
    expect(flat[0].name).toBe('Renamed Via Blocks');
  });

  it('preserves tabata when title changes and blocks payload unchanged', () => {
    const initialMeta = richTabataFixture() as Json;
    const vm = buildWorkoutSessionViewModel(initialMeta);
    const derived = deriveFlatExercisesFromMetadata(initialMeta);

    const { result } = renderHook(() => useTaskWorkoutAiHarness(initialMeta));

    act(() => {
      result.current.handleWorkoutViewerApply({
        title: 'Title From Block Path',
        description: 'New description',
        exercises: derived,
        blocks: vm.blocks,
      });
    });

    expect(result.current.title).toBe('Title From Block Path');
    const block = getMainBlock(result.current.metadata);
    expect(block.blockFormat).toBe('tabata');
    expect(block.name).toBe('MAIN');
  });
});
