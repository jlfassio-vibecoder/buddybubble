import { describe, expect, it } from 'vitest';

import {
  computeEmomSelfMinuteSplits,
  emomSetNumberToMinuteIndex,
} from '@/features/live-video/wrappers/interval/utils/computeEmomSelfMinuteSplits';
import type { WorkoutExerciseLogRow } from '@/features/live-video/hooks/useWorkoutLogs';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

function logRow(
  partial: Partial<WorkoutExerciseLogRow> & {
    exercise_name: string;
    set_number: number;
    active_seconds: number;
  },
): WorkoutExerciseLogRow {
  return {
    id: '1',
    user_id: 'u',
    session_id: 's',
    task_id: 't',
    weight_lbs: null,
    reps: null,
    rpe: null,
    created_at: '',
    ...partial,
  } as WorkoutExerciseLogRow;
}

const simpleBlocks: WorkoutSessionBlockView[] = [
  {
    id: 'emom-1',
    section: 'main',
    order: 1,
    name: 'EMOM',
    blockFormat: 'emom',
    formatParams: { rounds: 3, interval_seconds: 60 },
    subtitle: null,
    exercises: [
      { order: 1, exerciseName: 'Squat', sets: 1, reps: '5' },
      { order: 2, exerciseName: 'Push-up', sets: 1, reps: '10' },
    ],
    instructions: [],
  },
];

describe('emomSetNumberToMinuteIndex', () => {
  it('maps set_number to minute for simple EMOM', () => {
    expect(emomSetNumberToMinuteIndex(0, 2, { rounds: 3 })).toBe(2);
  });
});

describe('computeEmomSelfMinuteSplits', () => {
  it('returns minutes sorted with min active_seconds per minute', () => {
    const splits = computeEmomSelfMinuteSplits({
      logs: [
        logRow({ exercise_name: 'Squat', set_number: 1, active_seconds: 45 }),
        logRow({ exercise_name: 'Push-up', set_number: 1, active_seconds: 30 }),
        logRow({ exercise_name: 'Squat', set_number: 2, active_seconds: 50 }),
      ],
      blocks: simpleBlocks,
      formatParams: { rounds: 3, interval_seconds: 60 },
    });
    expect(splits).toEqual([
      { minuteIndex: 1, activeSeconds: 30, durationLabel: '0:30' },
      { minuteIndex: 2, activeSeconds: 50, durationLabel: '0:50' },
    ]);
  });

  it('falls back to set_number as minute when exercise name is not in block index', () => {
    const splits = computeEmomSelfMinuteSplits({
      logs: [
        logRow({ exercise_name: 'Kettlebell American Swings', set_number: 3, active_seconds: 36 }),
      ],
      blocks: [],
      formatParams: { rounds: 5 },
    });
    expect(splits).toEqual([{ minuteIndex: 3, activeSeconds: 36, durationLabel: '0:36' }]);
  });

  it('includes zero-second active time', () => {
    const splits = computeEmomSelfMinuteSplits({
      logs: [logRow({ exercise_name: 'Squat', set_number: 1, active_seconds: 0 })],
      blocks: simpleBlocks,
      formatParams: { rounds: 3, interval_seconds: 60 },
    });
    expect(splits).toEqual([{ minuteIndex: 1, activeSeconds: 0, durationLabel: '0:00' }]);
  });
});
