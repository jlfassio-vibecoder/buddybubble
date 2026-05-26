import { describe, expect, it } from 'vitest';
import {
  lastPerformedAtFromMetadata,
  mergeLastPerformedAtIntoTaskMetadata,
} from './merge-last-performed-at';

describe('mergeLastPerformedAtIntoTaskMetadata', () => {
  it('preserves existing metadata keys and sets last_performed_at', () => {
    const merged = mergeLastPerformedAtIntoTaskMetadata(
      { workout_type: 'Strength', notes: 'A' },
      '2026-05-24T12:00:00.000Z',
    );
    expect(merged).toEqual({
      workout_type: 'Strength',
      notes: 'A',
      last_performed_at: '2026-05-24T12:00:00.000Z',
    });
  });

  it('handles null or array metadata', () => {
    expect(mergeLastPerformedAtIntoTaskMetadata(null, '2026-05-24T12:00:00.000Z')).toEqual({
      last_performed_at: '2026-05-24T12:00:00.000Z',
    });
    expect(mergeLastPerformedAtIntoTaskMetadata(['bad'], '2026-05-24T12:00:00.000Z')).toEqual({
      last_performed_at: '2026-05-24T12:00:00.000Z',
    });
  });
});

describe('lastPerformedAtFromMetadata', () => {
  it('reads last_performed_at when present', () => {
    expect(lastPerformedAtFromMetadata({ last_performed_at: '2026-05-24T12:00:00.000Z' })).toBe(
      '2026-05-24T12:00:00.000Z',
    );
  });

  it('returns null for invalid metadata', () => {
    expect(lastPerformedAtFromMetadata(null)).toBeNull();
    expect(lastPerformedAtFromMetadata({ last_performed_at: '  ' })).toBeNull();
  });
});
