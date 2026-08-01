import { describe, expect, it } from 'vitest';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  exerciseHasPr,
  readSessionCompletion,
  readSessionDurationMin,
  readSessionRpe,
} from '@/lib/fitness/workout-log-session-stats';

describe('readSessionRpe', () => {
  it('returns — when missing or out of range', () => {
    expect(readSessionRpe({})).toBe('—');
    expect(readSessionRpe({ session_rpe: 0 })).toBe('—');
    expect(readSessionRpe({ session_rpe: 11 })).toBe('—');
  });

  it('returns rounded RPE in 1–10', () => {
    expect(readSessionRpe({ session_rpe: 8 })).toBe('8');
    expect(readSessionRpe({ session_rpe: '7.4' })).toBe('7');
  });
});

describe('readSessionCompletion', () => {
  it('prefers metadata completion / completion_pct', () => {
    expect(readSessionCompletion({ completion: 100 }, [])).toBe('100%');
    expect(readSessionCompletion({ completion_pct: 80 }, [])).toBe('80%');
  });

  it('derives from set_logs when meta missing', () => {
    const exercises: WorkoutExercise[] = [
      {
        name: 'Squat',
        set_logs: [
          { set: 1, done: true },
          { set: 2, done: true },
          { set: 3, done: false },
          { set: 4, done: false },
        ],
      },
    ];
    expect(readSessionCompletion({}, exercises)).toBe('50%');
  });

  it('returns — when no meta and no set_logs', () => {
    expect(readSessionCompletion({}, [{ name: 'Squat' }])).toBe('—');
  });
});

describe('exerciseHasPr', () => {
  it('is true only for pr: true', () => {
    expect(exerciseHasPr({ name: 'Bench', pr: true })).toBe(true);
    expect(exerciseHasPr({ name: 'Bench', pr: false })).toBe(false);
    expect(exerciseHasPr({ name: 'Bench' })).toBe(false);
    expect(exerciseHasPr(null)).toBe(false);
  });
});

describe('readSessionDurationMin', () => {
  it('prefers form duration then metadata', () => {
    expect(readSessionDurationMin('47', {})).toEqual({ value: '47', unit: 'min' });
    expect(readSessionDurationMin('', { duration_min: 40 })).toEqual({
      value: '40',
      unit: 'min',
    });
    expect(readSessionDurationMin('', {})).toEqual({ value: '—', unit: '' });
  });
});
