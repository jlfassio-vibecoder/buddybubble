import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import type { Json } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { deriveFlatExercisesFromMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { flatExerciseResolutionKey } from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { useTaskWorkoutAi } from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';

const mockPostGenerateWorkoutChain = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@/lib/workout-factory/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout-factory/api-client')>();
  return {
    ...actual,
    postGenerateWorkoutChain: mockPostGenerateWorkoutChain,
  };
});

import { WorkoutFactoryError } from '@/lib/workout-factory/api-client';

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

describe('useTaskWorkoutAi handleAiGenerateWorkout', () => {
  beforeEach(() => {
    mockPostGenerateWorkoutChain.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockPostGenerateWorkoutChain.mockResolvedValue({
      workoutSet: { title: 'Gen', description: '', difficulty: 'intermediate', workouts: [] },
      chain_metadata: {
        generated_at: '2026-01-01',
        model_used: 'test',
        pipeline: 'kanban_extract_enrich',
      },
      taskExercises: [],
      suggestedTitle: 'Gen',
      suggestedDescription: '',
    });
  });

  it('forwards macro planning daily_checkin to postGenerateWorkoutChain', async () => {
    const outline = [
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 10,
          is_alternating: true,
        },
        exercises: [{ name: 'Swing' }, { name: 'Thruster' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout({
        durationMinutes: 30,
        phaseIntent: 'standard_progression',
        progressionTrend: 'Appropriately Challenging',
        anchorLift: { name: 'Squat', weight: 185, reps: 5 },
        temporaryLimitations: 'Minor knee irritation',
      });
    });

    expect(mockPostGenerateWorkoutChain).toHaveBeenCalledTimes(1);
    const payload = mockPostGenerateWorkoutChain.mock.calls[0][0] as {
      daily_checkin?: Record<string, unknown>;
    };
    expect(payload.daily_checkin).toMatchObject({
      duration_minutes: 30,
      target_duration_min: 30,
      phase_intent: 'standard_progression',
      progression_trend: 'Appropriately Challenging',
      anchor_lift: { name: 'Squat', weight: 185, reps: 5 },
      temporary_limitations: 'Minor knee irritation',
    });
  });

  it('forwards coach_workout_outline from task metadata to postGenerateWorkoutChain', async () => {
    const outline = [
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 10,
          is_alternating: true,
        },
        exercises: [{ name: 'Swing' }, { name: 'Thruster' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    expect(mockPostGenerateWorkoutChain).toHaveBeenCalledTimes(1);
    const payload = mockPostGenerateWorkoutChain.mock.calls[0][0] as {
      coach_workout_outline?: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(payload.coach_workout_outline)).toBe(true);
    expect(payload.coach_workout_outline?.[0]?.block_format).toBe('emom');
    expect(payload.coach_workout_outline?.[0]?.name).toBe('Main EMOM');
  });

  it('forwards task_id to postGenerateWorkoutChain', async () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'straight_sets',
        exercises: [{ name: 'Squat' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    const payload = mockPostGenerateWorkoutChain.mock.calls[0][0] as { task_id?: string };
    expect(payload.task_id).toBe('task-1');
  });

  it('shows fallback success toast when chain_metadata.fill_fallback is true', async () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'straight_sets',
        exercises: [{ name: 'Squat' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    mockPostGenerateWorkoutChain.mockResolvedValueOnce({
      workoutSet: { title: 'Gen', description: '', difficulty: 'intermediate', workouts: [] },
      chain_metadata: {
        generated_at: '2026-01-01',
        model_used: 'test',
        pipeline: 'parametric_outline_fill',
        fill_fallback: true,
        fill_fallback_reason: 'parse failed',
      },
      taskExercises: [],
      suggestedTitle: 'Gen',
      suggestedDescription: '',
    });

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Workout generated with default prescriptions — review exercises before saving.',
    );
  });

  it('blocks generate when outline is not confirmed', async () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'straight_sets',
        exercises: [{ name: 'Squat' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      exercises: [],
    } as Json;

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    expect(mockPostGenerateWorkoutChain).not.toHaveBeenCalled();
  });

  it('shows prescription-friendly toast with Regenerate on 422 prescription failure', async () => {
    const outline = [
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 10,
          is_alternating: true,
        },
        exercises: [{ name: 'Swing' }, { name: 'Thruster' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    mockPostGenerateWorkoutChain.mockRejectedValueOnce(
      new WorkoutFactoryError('Outline fill failed', {
        code: 'OUTLINE_FILL_VALIDATION_FAILED',
        status: 422,
        validationError: 'needs sets, reps, or work_seconds',
        failureKind: 'validation',
        validationReason: 'prescription',
      }),
    );

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "AI couldn't finish exercise prescriptions. Your structure looks fine — try again.",
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Regenerate' }),
      }),
    );
  });

  it('shows structure mismatch toast on 422 structure failure', async () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'straight_sets',
        exercises: [{ name: 'Squat' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    mockPostGenerateWorkoutChain.mockRejectedValueOnce(
      new WorkoutFactoryError('Outline fill failed', {
        code: 'OUTLINE_FILL_VALIDATION_FAILED',
        status: 422,
        validationError: 'block count changed',
        failureKind: 'validation',
        validationReason: 'structure',
      }),
    );

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      'Generation hit a structure mismatch. Confirm structure or edit blocks, then try again.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Regenerate' }),
      }),
    );
  });

  it('shows parse-friendly toast with Regenerate on 422 parse failure', async () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'straight_sets',
        exercises: [{ name: 'Squat' }],
      },
    ];
    const meta = {
      coach_workout_outline: outline,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      exercises: [],
    } as Json;

    mockPostGenerateWorkoutChain.mockRejectedValueOnce(
      new WorkoutFactoryError('Outline fill failed', {
        code: 'OUTLINE_FILL_VALIDATION_FAILED',
        status: 422,
        validationError: 'Failed to parse JSON',
        failureKind: 'parse',
        validationReason: 'parse',
      }),
    );

    const { result } = renderHook(() => useTaskWorkoutAiHarness(meta));

    await act(async () => {
      await result.current.handleAiGenerateWorkout();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "We had trouble reading the AI's response format. Please try generating the workout again.",
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Regenerate' }),
      }),
    );
  });
});

describe('useTaskWorkoutAi handleWorkoutViewerCuePatches', () => {
  it('keeps both patches when two saves run before React re-renders', () => {
    const flatMeta = {
      exercises: [
        { name: 'Squat', form_cues: 'Old squat' },
        { name: 'Bench', form_cues: 'Old bench' },
      ],
    } as Json;

    const squatKey = flatExerciseResolutionKey({ name: 'Squat' }, 0);
    const benchKey = flatExerciseResolutionKey({ name: 'Bench' }, 1);

    const { result } = renderHook(() => useTaskWorkoutAiHarness(flatMeta));

    act(() => {
      result.current.handleWorkoutViewerCuePatches({
        [squatKey]: { form_cues: 'Knees out' },
      });
      result.current.handleWorkoutViewerCuePatches({
        [benchKey]: { form_cues: 'Scapular set' },
      });
    });

    const exercises = (result.current.metadata as { exercises: WorkoutExercise[] }).exercises;
    expect(exercises.find((e) => e.name === 'Squat')?.form_cues).toBe('Knees out');
    expect(exercises.find((e) => e.name === 'Bench')?.form_cues).toBe('Scapular set');
    expect(result.current.workoutExercises.find((e) => e.name === 'Squat')?.form_cues).toBe(
      'Knees out',
    );
    expect(result.current.workoutExercises.find((e) => e.name === 'Bench')?.form_cues).toBe(
      'Scapular set',
    );
  });
});
