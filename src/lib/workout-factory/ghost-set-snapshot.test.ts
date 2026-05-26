import { describe, expect, it } from 'vitest';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  buildBlankSessionDraftLogs,
  buildGhostLogsFromHistoricalMetadata,
  formatGhostFieldPlaceholder,
} from './ghost-set-snapshot';

const flatExercises: WorkoutExercise[] = [
  { name: 'Squat', sets: 3, reps: 5, weight: 135 },
  { name: 'Bench Press', sets: 2, reps: 8 },
];

describe('buildBlankSessionDraftLogs', () => {
  it('matches row counts from player initial logs but keeps cells blank', () => {
    const logs = buildBlankSessionDraftLogs(flatExercises, []);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toHaveLength(3);
    expect(logs[1]).toHaveLength(2);
    for (const row of logs) {
      for (const cell of row) {
        expect(cell).toEqual({ weight: '', reps: '', rpe: '', done: false });
      }
    }
  });
});

describe('buildGhostLogsFromHistoricalMetadata', () => {
  it('maps historical set_logs by exercise name', () => {
    const histMeta = {
      exercises: [
        {
          name: 'Squat',
          set_logs: [
            { weight: 225, reps: 8, rpe: 7 },
            { weight: 235, reps: 6, rpe: 8 },
            { weight: 245, reps: 4, rpe: 9 },
          ],
        },
        {
          name: 'Bench Press',
          set_logs: [{ weight: 185, reps: 10, rpe: 8 }],
        },
      ],
    };

    const ghost = buildGhostLogsFromHistoricalMetadata(histMeta, flatExercises, []);
    expect(ghost[0][0]).toEqual({ weight: '225', reps: '8', rpe: '7' });
    expect(ghost[0][2]).toEqual({ weight: '245', reps: '4', rpe: '9' });
    expect(ghost[1][0]).toEqual({ weight: '185', reps: '10', rpe: '8' });
    expect(ghost[1][1]).toEqual({ weight: null, reps: null, rpe: null });
  });

  it('returns empty ghost cells when historical metadata is missing', () => {
    const ghost = buildGhostLogsFromHistoricalMetadata(null, flatExercises, []);
    expect(ghost[0]).toHaveLength(3);
    expect(ghost[0][0]).toEqual({ weight: null, reps: null, rpe: null });
  });
});

describe('formatGhostFieldPlaceholder', () => {
  const ghost = { weight: '225', reps: '8', rpe: '7' };

  it('formats weight placeholder with Last prefix', () => {
    expect(formatGhostFieldPlaceholder(ghost, 'weight', 'lbs')).toBe('Last: 225');
  });

  it('formats reps placeholder with Last prefix', () => {
    expect(formatGhostFieldPlaceholder(ghost, 'reps', 'lbs')).toBe('Last: 8');
  });

  it('formats rpe placeholder with Last prefix', () => {
    expect(formatGhostFieldPlaceholder(ghost, 'rpe', 'lbs')).toBe('Last: 7');
  });

  it('returns undefined when ghost cell has no data for the field', () => {
    expect(
      formatGhostFieldPlaceholder({ weight: null, reps: null, rpe: null }, 'weight', 'lbs'),
    ).toBeUndefined();
  });
});
