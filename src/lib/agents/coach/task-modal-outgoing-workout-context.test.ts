import { describe, expect, it } from 'vitest';

import { buildTaskModalOutgoingWorkoutContext } from './task-modal-outgoing-workout-context';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import type { Json } from '@/types/database';

describe('buildTaskModalOutgoingWorkoutContext', () => {
  it('returns null when metadata has no rich workout set', () => {
    expect(buildTaskModalOutgoingWorkoutContext({}, 'Leg day')).toBeNull();
    expect(buildTaskModalOutgoingWorkoutContext({ workout_type: 'AMRAP' }, 'Leg day')).toBeNull();
  });

  it('returns slim context when saved (coreDirty false)', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    const parsed = metadata as Record<string, unknown>;
    const af = parsed.ai_workout_factory as Record<string, unknown>;
    const ctx = buildTaskModalOutgoingWorkoutContext(metadata, 'Tabata day', { coreDirty: false });
    expect(ctx).not.toBeNull();
    expect(ctx!.ai_workout_factory).toEqual({ workout_set: af.workout_set });
    expect(typeof ctx!.workout_structure_summary).toBe('string');
    expect(Array.isArray(ctx!.exercises)).toBe(true);
  });

  it('returns slim factory context when unsaved (coreDirty true)', () => {
    const metadata = richMetadataWithBlockFormat('tabata') as Json;
    const parsed = metadata as Record<string, unknown>;
    const af = parsed.ai_workout_factory as Record<string, unknown>;
    const ctx = buildTaskModalOutgoingWorkoutContext(metadata, 'Tabata day', {
      coreDirty: true,
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.ai_workout_factory).toEqual({ workout_set: af.workout_set });
    expect(ctx!.workout_task_title).toBe('Tabata day');
    expect(ctx!.ai_workout_factory).not.toHaveProperty('chain_metadata');
    expect(hasRichWorkoutSetInMetadata({ ai_workout_factory: ctx!.ai_workout_factory })).toBe(true);
    expect(typeof ctx!.workout_structure_summary).toBe('string');
    expect(Array.isArray(ctx!.exercises)).toBe(true);
  });
});
