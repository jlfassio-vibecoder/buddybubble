import { describe, expect, it } from 'vitest';
import {
  clearPendingWorkoutCuesSatisfiedByIncoming,
  reconcileWorkoutCueMetadata,
  snapshotPendingWorkoutCuePatches,
  type PendingWorkoutCueEntry,
} from './reconcile-workout-cue-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import type { Json } from '@/types/database';

describe('reconcileWorkoutCueMetadata', () => {
  it('copies local cue fields onto incoming when incoming lacks them', () => {
    const local = {
      exercises: [{ name: 'Squat', form_cues: 'Knees out', instructions: 'Brace' }],
    } as Json;
    const incoming = {
      exercises: [{ name: 'Squat', sets: 3 }],
    } as Json;

    const { metadata, pendingStillMissing } = reconcileWorkoutCueMetadata({
      local,
      incoming,
      pending: {},
    });

    const flat = parseWorkoutExercisesFromMetadata(metadata);
    expect(flat[0]?.form_cues).toBe('Knees out');
    expect(flat[0]?.instructions).toBe('Brace');
    expect(pendingStillMissing).toBe(false);
  });

  it('prefers incoming when it already has the cue fields', () => {
    const local = {
      exercises: [{ name: 'Squat', form_cues: 'Local cue' }],
    } as Json;
    const incoming = {
      exercises: [{ name: 'Squat', form_cues: 'Server cue' }],
    } as Json;

    const { metadata } = reconcileWorkoutCueMetadata({ local, incoming });
    const flat = parseWorkoutExercisesFromMetadata(metadata);
    expect(flat[0]?.form_cues).toBe('Server cue');
  });

  it('sets pendingStillMissing when pending fields are absent on incoming', () => {
    const local = {
      exercises: [{ name: 'Squat', form_cues: 'Knees out' }],
    } as Json;
    const incoming = {
      exercises: [{ name: 'Squat' }],
    } as Json;

    const { metadata, pendingStillMissing } = reconcileWorkoutCueMetadata({
      local,
      incoming,
      pending: {
        'squat::0': { form_cues: 'Knees out' },
      },
    });

    expect(pendingStillMissing).toBe(true);
    expect(parseWorkoutExercisesFromMetadata(metadata)[0]?.form_cues).toBe('Knees out');
  });

  it('clears pendingStillMissing when incoming already has pending fields', () => {
    const local = {
      exercises: [{ name: 'Squat', form_cues: 'Knees out' }],
    } as Json;
    const incoming = {
      exercises: [{ name: 'Squat', form_cues: 'Knees out' }],
    } as Json;

    const { pendingStillMissing } = reconcileWorkoutCueMetadata({
      local,
      incoming,
      pending: {
        'squat::0': { form_cues: 'Knees out' },
      },
    });

    expect(pendingStillMissing).toBe(false);
  });
});

describe('snapshotPendingWorkoutCuePatches', () => {
  it('aggregates active patches and drops expired', () => {
    const map = new Map<string, PendingWorkoutCueEntry>([
      [
        'm1',
        {
          resolution_key: 'squat::0',
          patch: { form_cues: 'A' },
          at: Date.now(),
        },
      ],
      [
        'm-old',
        {
          resolution_key: 'bench::1',
          patch: { tips: 'old' },
          at: Date.now() - 60_000,
        },
      ],
    ]);

    const snap = snapshotPendingWorkoutCuePatches(map);
    expect(snap['squat::0']?.form_cues).toBe('A');
    expect(snap['bench::1']).toBeUndefined();
    expect(map.has('m-old')).toBe(false);
  });
});

describe('clearPendingWorkoutCuesSatisfiedByIncoming', () => {
  it('removes pending when incoming has the fields', () => {
    const map = new Map<string, PendingWorkoutCueEntry>([
      [
        'm1',
        {
          resolution_key: 'squat::0',
          patch: { form_cues: 'Knees out' },
          at: Date.now(),
        },
      ],
    ]);

    clearPendingWorkoutCuesSatisfiedByIncoming(map, {
      exercises: [{ name: 'Squat', form_cues: 'Knees out' }],
    } as Json);

    expect(map.size).toBe(0);
  });

  it('keeps pending when incoming still lacks fields', () => {
    const map = new Map<string, PendingWorkoutCueEntry>([
      [
        'm1',
        {
          resolution_key: 'squat::0',
          patch: { form_cues: 'Knees out' },
          at: Date.now(),
        },
      ],
    ]);

    clearPendingWorkoutCuesSatisfiedByIncoming(map, {
      exercises: [{ name: 'Squat' }],
    } as Json);

    expect(map.size).toBe(1);
  });
});
