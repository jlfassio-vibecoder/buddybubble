import { describe, expect, it } from 'vitest';

import { normalizeStructuralToken, structuralTokensMatch } from './structural-id-match';
import { applyStructuralPatchToTaskMetadata } from './apply-structural-patch-to-task-metadata';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';

describe('structural-id-match', () => {
  it('normalizes model-invented slug ids', () => {
    expect(normalizeStructuralToken('warm-up-block-id')).toBe('warm-up');
    expect(normalizeStructuralToken('Foam Roller Thoracic Extension')).toBe(
      'foam-roller-thoracic-extension',
    );
    expect(normalizeStructuralToken('foam-roller-thoracic-extension-exercise-id')).toBe(
      'foam-roller-thoracic-extension',
    );
  });

  it('strips typographic apostrophes', () => {
    expect(normalizeStructuralToken('athlete\u2019s warm-up')).toBe('athletes-warm-up');
    expect(structuralTokensMatch('athlete\u2019s warm-up', 'athletes-warm-up')).toBe(true);
  });
});

function withNamedMainBlocks(
  blocks: Array<{
    id: string;
    name: string;
    exercises: Array<{ id: string; exerciseName: string; sets?: number; reps?: string }>;
  }>,
): Record<string, unknown> {
  const base = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
  const af = base.ai_workout_factory as Record<string, unknown>;
  const ws = af.workout_set as Record<string, unknown>;
  const workouts = ws.workouts as Array<Record<string, unknown>>;
  const session = { ...workouts[0]! };
  session.exerciseBlocks = blocks.map((b, bi) => ({
    id: b.id,
    order: bi + 1,
    name: b.name,
    blockFormat: bi === 1 ? 'emom' : bi === 2 ? 'tabata' : 'straight_sets',
    formatParams: {},
    exercises: b.exercises.map((ex, ei) => ({
      id: ex.id,
      order: ei + 1,
      exerciseName: ex.exerciseName,
      sets: ex.sets ?? 2,
      reps: ex.reps ?? '10',
    })),
  }));
  ws.workouts = [session, ...workouts.slice(1)];
  af.workout_set = ws;
  base.ai_workout_factory = af;
  return base;
}

describe('applyStructuralPatchToTaskMetadata name fallback', () => {
  it('applies RPE when Gemini invents warm-up / exercise slug ids', () => {
    const base = withNamedMainBlocks([
      {
        id: 'main-1-0',
        name: 'Warm-up',
        exercises: [
          { id: 'main-1-0:e0', exerciseName: 'Foam Roller Thoracic Extension' },
          { id: 'main-1-0:e1', exerciseName: 'Band Pull-Aparts' },
          { id: 'main-1-0:e2', exerciseName: 'Quadruped Serratus Slides' },
        ],
      },
      {
        id: 'main-2-1',
        name: 'Main EMOM',
        exercises: [
          { id: 'main-2-1:e0', exerciseName: 'Goblet Squat' },
          { id: 'main-2-1:e1', exerciseName: 'Push-up' },
        ],
      },
      {
        id: 'main-3-2',
        name: 'FINISHER — Classic HIIT',
        exercises: [{ id: 'main-3-2:e0', exerciseName: 'Mountain Climbers' }],
      },
    ]);

    const { metadata, touched } = applyStructuralPatchToTaskMetadata(base, [
      {
        block_id: 'warm-up-block-id',
        exercise_id: 'foam-roller-thoracic-extension-exercise-id',
        rpe: 5,
      },
      {
        block_id: 'warm-up-block-id',
        exercise_id: 'band-pull-aparts-exercise-id',
        rpe: 5,
      },
      {
        block_id: 'warm-up-block-id',
        exercise_id: 'quadruped-serratus-slides-exercise-id',
        rpe: 5,
      },
      { block_id: 'main-emom-block-id', exercise_id: 'goblet-squat-exercise-id', rpe: 7.5 },
      { block_id: 'main-emom-block-id', exercise_id: 'push-up-exercise-id', rpe: 7.5 },
      {
        block_id: 'finisher-classic-hiit-block-id',
        exercise_id: 'mountain-climbers-exercise-id',
        rpe: 8.5,
      },
    ]);

    expect(touched).toBe(true);
    const nextAf = metadata.ai_workout_factory as Record<string, unknown>;
    const nextWs = nextAf.workout_set as Record<string, unknown>;
    const nextSession = (nextWs.workouts as Array<Record<string, unknown>>)[0]!;
    const nextBlocks = nextSession.exerciseBlocks as Array<Record<string, unknown>>;
    const warmupEx = nextBlocks[0]!.exercises as Array<Record<string, unknown>>;
    const emomEx = nextBlocks[1]!.exercises as Array<Record<string, unknown>>;
    const finisherEx = nextBlocks[2]!.exercises as Array<Record<string, unknown>>;
    expect(warmupEx.map((e) => e.rpe)).toEqual([5, 5, 5]);
    expect(emomEx.map((e) => e.rpe)).toEqual([7.5, 7.5]);
    expect(finisherEx[0]!.rpe).toBe(8.5);
  });
});
