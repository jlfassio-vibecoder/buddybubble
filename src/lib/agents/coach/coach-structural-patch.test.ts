import { describe, expect, it } from 'vitest';

import { applyCoachPatchToCanvas, mergeCoachPrescriptionIntoDraft } from './coach-structural-patch';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';

function makeExercise(id: string, name: string, reps: string): Exercise {
  return { id, order: 1, exerciseName: name, sets: 3, reps };
}

function makeBlock(id: string, name: string, exercises: Exercise[]): WorkoutSessionBlockView {
  return {
    id,
    section: 'main',
    order: 1,
    name,
    blockFormat: 'straight_sets',
    formatParams: {},
    subtitle: null,
    exercises,
    instructions: [],
  };
}

function largeWorkout(): WorkoutSessionBlockView[] {
  const blocks: WorkoutSessionBlockView[] = [];
  for (let b = 0; b < 6; b++) {
    const blockId = `main-${b + 1}-${b}`;
    const exercises: Exercise[] = [];
    for (let e = 0; e < 5; e++) {
      exercises.push(makeExercise(`${blockId}:e${e}`, `Exercise ${b}-${e}`, String(8 + e)));
    }
    blocks.push(makeBlock(blockId, `Block ${b + 1}`, exercises));
  }
  return blocks;
}

describe('applyCoachPatchToCanvas', () => {
  it('mutates only the targeted exercise and leaves the rest identical by reference', () => {
    const current = largeWorkout();
    const targetBlock = current[2]!;
    const targetExercise = targetBlock.exercises[3]!;
    const untouchedBlock = current[0]!;
    const siblingExercise = targetBlock.exercises[0]!;

    const next = applyCoachPatchToCanvas(current, [
      {
        block_id: targetBlock.id,
        exercise_id: targetExercise.id,
        reps: '12',
      },
    ]);

    expect(next).not.toBe(current);
    expect(next[0]).toBe(untouchedBlock);
    expect(next[1]).toBe(current[1]);
    expect(next[3]).toBe(current[3]);
    expect(next[4]).toBe(current[4]);
    expect(next[5]).toBe(current[5]);

    const patchedBlock = next[2]!;
    expect(patchedBlock).not.toBe(targetBlock);
    expect(patchedBlock.exercises[0]).toBe(siblingExercise);
    expect(patchedBlock.exercises[1]).toBe(targetBlock.exercises[1]);
    expect(patchedBlock.exercises[2]).toBe(targetBlock.exercises[2]);
    expect(patchedBlock.exercises[4]).toBe(targetBlock.exercises[4]);
    expect(patchedBlock.exercises[3]).not.toBe(targetExercise);
    expect(patchedBlock.exercises[3]!.reps).toBe('12');
    expect(patchedBlock.exercises[3]!.exerciseName).toBe(targetExercise.exerciseName);
    expect(patchedBlock.exercises[3]!.sets).toBe(targetExercise.sets);

    // Deep equality for every non-targeted exercise across the whole array.
    for (let bi = 0; bi < current.length; bi++) {
      for (let ei = 0; ei < current[bi]!.exercises.length; ei++) {
        if (bi === 2 && ei === 3) continue;
        expect(next[bi]!.exercises[ei]).toEqual(current[bi]!.exercises[ei]);
        if (bi !== 2) {
          expect(next[bi]!.exercises[ei]).toBe(current[bi]!.exercises[ei]);
        }
      }
    }
  });

  it('no-ops unknown ids without wiping the draft', () => {
    const current = largeWorkout();
    const next = applyCoachPatchToCanvas(current, [
      { block_id: 'missing-block', exercise_id: 'x', reps: '99' },
    ]);
    expect(next).toBe(current);
  });

  it('add_exercise appends a new exercise without rewriting sibling blocks', () => {
    const current = largeWorkout();
    const target = current[1]!;
    const beforeLen = target.exercises.length;
    const next = applyCoachPatchToCanvas(current, [
      {
        op: 'add_exercise',
        block_id: target.id,
        name: 'Face Pull',
        sets: 3,
        reps: '12',
        rpe: 7,
      },
    ]);
    expect(next[0]).toBe(current[0]);
    expect(next[1]).not.toBe(target);
    expect(next[1]!.exercises).toHaveLength(beforeLen + 1);
    expect(next[1]!.exercises[beforeLen]!.exerciseName).toBe('Face Pull');
    expect(next[1]!.exercises[beforeLen]!.rpe).toBe(7);
  });

  it('fans out block-level format_params.target_rpe onto every exercise.rpe', () => {
    const current = largeWorkout();
    const target = current[2]!;
    const next = applyCoachPatchToCanvas(current, [
      {
        block_id: target.id,
        format_params: { target_rpe: 7.5 },
      },
    ]);
    expect(next[2]).not.toBe(target);
    expect(next[2]!.formatParams.target_rpe).toBe(7.5);
    for (const ex of next[2]!.exercises) {
      expect(ex.rpe).toBe(7.5);
    }
    expect(next[0]).toBe(current[0]);
  });

  it('fans out block-level top-level rpe onto every exercise', () => {
    const current = largeWorkout();
    const target = current[1]!;
    const next = applyCoachPatchToCanvas(current, [{ block_id: target.id, rpe: 8 }]);
    for (const ex of next[1]!.exercises) {
      expect(ex.rpe).toBe(8);
    }
  });

  it('updates only the targeted exercise when exercise_id + rpe is set', () => {
    const current = largeWorkout();
    const target = current[0]!;
    const next = applyCoachPatchToCanvas(current, [
      { block_id: target.id, exercise_id: target.exercises[1]!.id, rpe: 7 },
    ]);
    expect(next[0]!.exercises[1]!.rpe).toBe(7);
    expect(next[0]!.exercises[0]!.rpe).toBeUndefined();
    expect(next[0]!.exercises[2]!.rpe).toBeUndefined();
  });

  it('matches invented slug ids to warm-up / finisher block and exercise names', () => {
    const current: WorkoutSessionBlockView[] = [
      makeBlock('main-1-0', 'Warm-up', [
        makeExercise('main-1-0:e0', 'Foam Roller Thoracic Extension', '10'),
        makeExercise('main-1-0:e1', 'Band Pull-Aparts', '15'),
      ]),
      makeBlock('main-3-2', 'FINISHER — Classic HIIT', [
        makeExercise('main-3-2:e0', 'Mountain Climbers', '1'),
      ]),
    ];
    const next = applyCoachPatchToCanvas(current, [
      {
        block_id: 'warm-up-block-id',
        exercise_id: 'foam-roller-thoracic-extension-exercise-id',
        rpe: 5,
      },
      {
        block_id: 'finisher-classic-hiit-block-id',
        exercise_id: 'mountain-climbers-exercise-id',
        rpe: 8.5,
      },
    ]);
    expect(next[0]!.exercises[0]!.rpe).toBe(5);
    expect(next[0]!.exercises[1]!.rpe).toBeUndefined();
    expect(next[1]!.exercises[0]!.rpe).toBe(8.5);
  });
});

describe('mergeCoachPrescriptionIntoDraft', () => {
  it('writes source exercise.rpe into matching draft rows without replacing block names', () => {
    const draft = largeWorkout();
    const source = draft.map((b, bi) => ({
      ...b,
      exercises: b.exercises.map((ex) => (bi === 0 ? { ...ex, rpe: 7.5 } : { ...ex })),
    }));

    const next = mergeCoachPrescriptionIntoDraft(draft, source);
    expect(next).not.toBe(draft);
    for (const ex of next[0]!.exercises) {
      expect(ex.rpe).toBe(7.5);
    }
    expect(next[1]!.exercises[0]!.rpe).toBeUndefined();
    expect(next[0]!.name).toBe(draft[0]!.name);
  });
});
