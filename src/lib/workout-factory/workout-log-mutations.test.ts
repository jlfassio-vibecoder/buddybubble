import { describe, expect, it } from 'vitest';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { removeSetRow } from './workout-log-mutations';

function makeSet(overrides: Partial<SetDraft> = {}): SetDraft {
  return { weight: '', reps: '', rpe: '', done: false, ...overrides };
}

describe('removeSetRow', () => {
  it('removes the last row when length > 1', () => {
    const draftLogs: SetDraft[][] = [[makeSet({ weight: '100' }), makeSet({ weight: '110' })]];
    const result = removeSetRow(draftLogs, 0);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].weight).toBe('100');
  });

  it('is a no-op when only one row remains', () => {
    const draftLogs: SetDraft[][] = [[makeSet({ weight: '100' })]];
    const result = removeSetRow(draftLogs, 0);
    expect(result).toBe(draftLogs);
    expect(result[0]).toHaveLength(1);
  });

  it('is a no-op on invalid exercise index', () => {
    const draftLogs: SetDraft[][] = [[makeSet(), makeSet()]];
    const result = removeSetRow(draftLogs, 5);
    expect(result).toBe(draftLogs);
    expect(result[0]).toHaveLength(2);
  });

  it('does not mutate input arrays', () => {
    const row0 = [makeSet({ weight: '100' }), makeSet({ weight: '110' })];
    const draftLogs: SetDraft[][] = [row0];
    removeSetRow(draftLogs, 0);
    expect(row0).toHaveLength(2);
    expect(draftLogs[0]).toHaveLength(2);
  });
});
