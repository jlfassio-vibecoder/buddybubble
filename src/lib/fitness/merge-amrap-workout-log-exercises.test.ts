import { describe, expect, it } from 'vitest';
import {
  filterAmrapActualLogsForBlock,
  mergeAmrapWorkoutLogExercises,
  type AmrapActualLogRow,
} from '@/lib/fitness/merge-amrap-workout-log-exercises';
import type { WorkoutExercise } from '@/lib/item-metadata';

const bandedSquat: WorkoutExercise = { name: 'Banded Squat', reps: 12, weight: 0 };
const bentOverRow: WorkoutExercise = { name: 'Resistance Band Bent-Over Row', reps: '10-12' };

describe('mergeAmrapWorkoutLogExercises', () => {
  it('uses 135 lbs on round 2 (set_number 2) for the matching exercise', () => {
    const actuals: AmrapActualLogRow[] = [
      {
        exercise_name: 'Banded Squat',
        set_number: 2,
        weight_lbs: 135,
        reps: 12,
        rpe: 8,
      },
    ];

    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 3, actuals);

    expect(result).toHaveLength(1);
    expect(result[0]?.sets).toBe(3);
    expect(result[0]?.set_logs).toHaveLength(3);
    expect(result[0]?.set_logs[0]).toEqual({ set: 1, reps: 12, weight: 0, done: true });
    expect(result[0]?.set_logs[1]).toEqual({
      set: 2,
      weight: 135,
      reps: 12,
      rpe: 8,
      done: true,
    });
    expect(result[0]?.set_logs[2]).toEqual({ set: 3, reps: 12, weight: 0, done: true });
  });

  it('expands a 1-round template to 3 AMRAP rounds with 3 set_logs per exercise', () => {
    const result = mergeAmrapWorkoutLogExercises([bandedSquat, bentOverRow], 3, []);

    expect(result).toHaveLength(2);
    expect(result[0]?.set_logs.map((s) => s.set)).toEqual([1, 2, 3]);
    expect(result[1]?.set_logs.map((s) => s.set)).toEqual([1, 2, 3]);
    expect(result[1]?.reps).toBe('10-12');
  });

  it('merges partial actuals with prescription fallback on unlogged sets', () => {
    const actuals: AmrapActualLogRow[] = [
      {
        exercise_name: 'Banded Squat',
        set_number: 2,
        weight_lbs: 140,
        reps: 10,
        rpe: 9,
      },
    ];

    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 3, actuals);

    expect(result[0]?.set_logs[0]).toEqual({ set: 1, reps: 12, weight: 0, done: true });
    expect(result[0]?.set_logs[1]?.weight).toBe(140);
    expect(result[0]?.set_logs[2]).toEqual({ set: 3, reps: 12, weight: 0, done: true });
  });

  it('falls back entirely to prescription when no actual rows exist', () => {
    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 2, []);

    expect(result[0]?.set_logs).toEqual([
      { set: 1, reps: 12, weight: 0, done: true },
      { set: 2, reps: 12, weight: 0, done: true },
    ]);
  });

  it('ignores actual rows beyond roundsCompleted', () => {
    const actuals: AmrapActualLogRow[] = [
      {
        exercise_name: 'Banded Squat',
        set_number: 4,
        weight_lbs: 200,
        reps: 5,
        rpe: 10,
      },
    ];

    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 3, actuals);

    expect(result[0]?.set_logs).toHaveLength(3);
    expect(result[0]?.set_logs.every((s) => s.weight === 0)).toBe(true);
  });

  it('omits weight when actual weight_lbs is null', () => {
    const actuals: AmrapActualLogRow[] = [
      {
        exercise_name: 'Banded Squat',
        set_number: 1,
        weight_lbs: null,
        reps: 15,
        rpe: null,
      },
    ];

    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 1, actuals);

    expect(result[0]?.set_logs[0]).toEqual({ set: 1, reps: 15, done: true });
    expect(result[0]?.set_logs[0]).not.toHaveProperty('weight');
    expect(result[0]?.set_logs[0]).not.toHaveProperty('rpe');
  });

  it('returns empty array when roundsCompleted is zero', () => {
    expect(mergeAmrapWorkoutLogExercises([bandedSquat], 0, [])).toEqual([]);
  });
});

describe('filterAmrapActualLogsForBlock', () => {
  const blockStart = '2026-06-01T12:00:00.000Z';

  it('keeps logs from any task_id after block start (deck card switch)', () => {
    const actuals: AmrapActualLogRow[] = [
      {
        exercise_name: 'Banded Squat',
        set_number: 2,
        weight_lbs: 135,
        reps: 12,
        rpe: 8,
        task_id: 'origin-task-id',
        created_at: '2026-06-01T12:05:00.000Z',
      },
      {
        exercise_name: 'Banded Squat',
        set_number: 2,
        weight_lbs: 145,
        reps: 11,
        rpe: 9,
        task_id: 'switched-deck-task-id',
        created_at: '2026-06-01T12:10:00.000Z',
      },
    ];

    const filtered = filterAmrapActualLogsForBlock(actuals, blockStart);
    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 2, filtered);

    expect(result[0]?.set_logs[1]).toEqual({
      set: 2,
      weight: 145,
      reps: 11,
      rpe: 9,
      done: true,
    });
  });

  it('drops logs before block start', () => {
    const actuals: AmrapActualLogRow[] = [
      {
        exercise_name: 'Banded Squat',
        set_number: 1,
        weight_lbs: 999,
        reps: 1,
        rpe: 10,
        created_at: '2026-06-01T11:59:00.000Z',
      },
    ];

    const filtered = filterAmrapActualLogsForBlock(actuals, blockStart);
    const result = mergeAmrapWorkoutLogExercises([bandedSquat], 1, filtered);

    expect(result[0]?.set_logs[0]).toEqual({ set: 1, reps: 12, weight: 0, done: true });
  });
});
