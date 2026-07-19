import { describe, expect, it } from 'vitest';

import { applyStructuralPatchToTaskMetadata } from './apply-structural-patch-to-task-metadata';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';

describe('applyStructuralPatchToTaskMetadata', () => {
  it('updates only the matched exercise reps inside workout_set', () => {
    const base = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Array<Record<string, unknown>>;
    const session = { ...workouts[0]! };
    const blocks = session.exerciseBlocks as Array<Record<string, unknown>>;
    const block: Record<string, unknown> = { ...blocks[0]!, id: 'main-1-0' };
    const exercises: Array<Record<string, unknown>> = (
      block.exercises as Array<Record<string, unknown>>
    ).map((ex, i) => ({
      ...ex,
      id: `main-1-0:e${i}`,
    }));
    block.exercises = exercises;
    session.exerciseBlocks = [block, ...blocks.slice(1)];
    ws.workouts = [session, ...workouts.slice(1)];
    af.workout_set = ws;
    base.ai_workout_factory = af;

    const originalReps = String(exercises[0]!.reps ?? '');
    const { metadata, touched } = applyStructuralPatchToTaskMetadata(base, [
      { block_id: 'main-1-0', exercise_id: 'main-1-0:e0', reps: '15' },
    ]);

    expect(touched).toBe(true);
    const nextAf = metadata.ai_workout_factory as Record<string, unknown>;
    const nextWs = nextAf.workout_set as Record<string, unknown>;
    const nextSession = (nextWs.workouts as Array<Record<string, unknown>>)[0]!;
    const nextBlocks = nextSession.exerciseBlocks as Array<Record<string, unknown>>;
    const nextEx = (nextBlocks[0]!.exercises as Array<Record<string, unknown>>)[0]!;
    expect(nextEx.reps).toBe('15');
    expect(originalReps).not.toBe('15');
  });

  it('fans out block-level target_rpe onto every exercise in the block', () => {
    const base = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Array<Record<string, unknown>>;
    const session = { ...workouts[0]! };
    const blocks = session.exerciseBlocks as Array<Record<string, unknown>>;
    const block: Record<string, unknown> = { ...blocks[0]!, id: 'main-1-0' };
    const exercises: Array<Record<string, unknown>> = (
      block.exercises as Array<Record<string, unknown>>
    ).map((ex, i) => ({
      ...ex,
      id: `main-1-0:e${i}`,
    }));
    block.exercises = exercises;
    session.exerciseBlocks = [block, ...blocks.slice(1)];
    ws.workouts = [session, ...workouts.slice(1)];
    af.workout_set = ws;
    base.ai_workout_factory = af;

    const { metadata, touched } = applyStructuralPatchToTaskMetadata(base, [
      { block_id: 'main-1-0', format_params: { target_rpe: 7.5 } },
    ]);

    expect(touched).toBe(true);
    const nextAf = metadata.ai_workout_factory as Record<string, unknown>;
    const nextWs = nextAf.workout_set as Record<string, unknown>;
    const nextSession = (nextWs.workouts as Array<Record<string, unknown>>)[0]!;
    const nextBlocks = nextSession.exerciseBlocks as Array<Record<string, unknown>>;
    const nextExs = nextBlocks[0]!.exercises as Array<Record<string, unknown>>;
    expect(nextBlocks[0]!.formatParams).toMatchObject({ target_rpe: 7.5 });
    for (const ex of nextExs) {
      expect(ex.rpe).toBe(7.5);
    }
  });

  it('fans out block-level top-level rpe onto every exercise', () => {
    const base = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Array<Record<string, unknown>>;
    const session = { ...workouts[0]! };
    const blocks = session.exerciseBlocks as Array<Record<string, unknown>>;
    const block: Record<string, unknown> = { ...blocks[0]!, id: 'main-1-0' };
    const exercises: Array<Record<string, unknown>> = (
      block.exercises as Array<Record<string, unknown>>
    ).map((ex, i) => ({
      ...ex,
      id: `main-1-0:e${i}`,
    }));
    block.exercises = exercises;
    session.exerciseBlocks = [block, ...blocks.slice(1)];
    ws.workouts = [session, ...workouts.slice(1)];
    af.workout_set = ws;
    base.ai_workout_factory = af;

    const { metadata, touched } = applyStructuralPatchToTaskMetadata(base, [
      { block_id: 'main-1-0', rpe: 8 },
    ]);

    expect(touched).toBe(true);
    const nextAf = metadata.ai_workout_factory as Record<string, unknown>;
    const nextWs = nextAf.workout_set as Record<string, unknown>;
    const nextSession = (nextWs.workouts as Array<Record<string, unknown>>)[0]!;
    const nextBlocks = nextSession.exerciseBlocks as Array<Record<string, unknown>>;
    const nextExs = nextBlocks[0]!.exercises as Array<Record<string, unknown>>;
    for (const ex of nextExs) {
      expect(ex.rpe).toBe(8);
    }
  });
});
