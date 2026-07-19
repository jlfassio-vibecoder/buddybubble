/**
 * Apply Coach `structural_patch` ops onto `tasks.metadata` rich workout_set by id.
 * Canonical for Vitest; Deno mirror at `supabase/functions/_shared/workout-metadata/`.
 */

import type { CoachStructuralPatchOp } from './structural-patch-types';
import { blockMatchesStructuralId, exerciseMatchesStructuralId } from './structural-id-match';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/** RPE 1–10; keeps half-steps (e.g. 7.5). */
function clampRpe(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 1 || v > 10) return null;
  return v;
}

/** Prefer top-level `rpe`, else `format_params.target_rpe` (block-level Coach emits). */
function resolveOpRpe(op: CoachStructuralPatchOp): number | null {
  const top = clampRpe(op.rpe);
  if (top != null) return top;
  if (isPlainObject(op.format_params)) {
    return clampRpe(op.format_params.target_rpe);
  }
  return null;
}

function positiveOrder(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v);
  return fallback;
}

type SectionKind = 'main' | 'warmup' | 'finisher' | 'cooldown';

function resolveBlockId(
  block: Record<string, unknown>,
  section: SectionKind,
  index: number,
): string {
  if (typeof block.id === 'string' && block.id.trim()) return block.id.trim();
  const order = positiveOrder(block.order, index + 1);
  if (section === 'main') return `main-${order}-${index}`;
  return `${section}-${order}-${index}`;
}

function resolveExerciseId(ex: Record<string, unknown>, blockId: string, index: number): string {
  if (typeof ex.id === 'string' && ex.id.trim()) return ex.id.trim();
  return `${blockId}:e${index}`;
}

function mergeFactoryExercise(
  ex: Record<string, unknown>,
  op: CoachStructuralPatchOp,
): Record<string, unknown> {
  const next = { ...ex };
  if (typeof op.name === 'string' && op.name.trim()) {
    next.exerciseName = op.name.trim();
  }
  const sets = positiveInt(op.sets);
  if (sets != null) next.sets = sets;
  if (typeof op.reps === 'string') next.reps = op.reps;
  if (typeof op.coach_notes === 'string') {
    const t = op.coach_notes.trim();
    if (t) next.coachNotes = t;
  }
  const rest = positiveInt(op.rest_seconds);
  if (rest != null) next.restSeconds = rest;
  const work = positiveInt(op.work_seconds);
  if (work != null) next.workSeconds = work;
  const rpe = resolveOpRpe(op);
  if (rpe != null) next.rpe = rpe;
  return next;
}

function mergeFactoryBlockLevel(
  block: Record<string, unknown>,
  op: CoachStructuralPatchOp,
  section: SectionKind,
): Record<string, unknown> {
  let next: Record<string, unknown> = { ...block };
  if (typeof op.name === 'string' && op.name.trim()) {
    if (section === 'main') next.name = op.name.trim();
    else next.exerciseName = op.name.trim();
  }
  // Format params / block_format apply to any block that already uses them (main +
  // exercise-shaped finishers stored in exerciseBlocks or instruction sections).
  if (typeof op.block_format === 'string' && op.block_format.trim()) {
    next.blockFormat = op.block_format.trim();
  }
  if (isPlainObject(op.format_params)) {
    const prev = isPlainObject(next.formatParams) ? next.formatParams : {};
    next.formatParams = { ...prev, ...op.format_params };
  }
  // Block-level RPE → every exercise so WorkoutBlockExerciseEditRow can show it.
  const fanoutRpe = resolveOpRpe(op);
  if (fanoutRpe != null && Array.isArray(next.exercises) && next.exercises.length > 0) {
    next = {
      ...next,
      exercises: (next.exercises as unknown[]).map((exRaw) => {
        if (!isPlainObject(exRaw)) return exRaw;
        if (exRaw.rpe === fanoutRpe) return exRaw;
        return { ...exRaw, rpe: fanoutRpe };
      }),
    };
  }
  return next;
}

function buildAddedFactoryExercise(
  blockId: string,
  index: number,
  op: CoachStructuralPatchOp,
): Record<string, unknown> | null {
  const name = typeof op.name === 'string' ? op.name.trim() : '';
  if (!name) return null;
  const sets = positiveInt(op.sets) ?? 3;
  const reps = typeof op.reps === 'string' && op.reps.trim() ? op.reps.trim() : '8';
  const ex: Record<string, unknown> = {
    id: `${blockId}:e${index}`,
    order: index + 1,
    exerciseName: name,
    sets,
    reps,
  };
  if (typeof op.coach_notes === 'string' && op.coach_notes.trim()) {
    ex.coachNotes = op.coach_notes.trim();
  }
  const rest = positiveInt(op.rest_seconds);
  if (rest != null) ex.restSeconds = rest;
  const work = positiveInt(op.work_seconds);
  if (work != null) ex.workSeconds = work;
  const rpe = resolveOpRpe(op);
  if (rpe != null) ex.rpe = rpe;
  return ex;
}

function findBlockIndex(blocks: unknown[], section: SectionKind, patchBlockId: string): number {
  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i];
    if (!isPlainObject(raw)) continue;
    const blockId = resolveBlockId(raw, section, i);
    if (blockMatchesStructuralId(raw, blockId, patchBlockId)) return i;
  }
  return -1;
}

function applyOpsToBlock(
  raw: Record<string, unknown>,
  section: SectionKind,
  index: number,
  ops: readonly CoachStructuralPatchOp[],
): { block: Record<string, unknown>; touched: boolean } {
  const blockId = resolveBlockId(raw, section, index);
  let block: Record<string, unknown> = { ...raw, id: blockId };
  let touched = false;

  for (const op of ops) {
    const opKind = op.op === 'add_exercise' ? 'add_exercise' : 'update';
    if (opKind === 'add_exercise') {
      // Allow append on any block that already has (or can hold) an exercises array.
      const exercises = Array.isArray(block.exercises) ? [...(block.exercises as unknown[])] : [];
      const added = buildAddedFactoryExercise(blockId, exercises.length, op);
      if (!added) continue;
      exercises.push(added);
      block = { ...block, exercises };
      touched = true;
      continue;
    }

    const exerciseId =
      typeof op.exercise_id === 'string' && op.exercise_id.trim() ? op.exercise_id.trim() : null;

    if (exerciseId && Array.isArray(block.exercises)) {
      let exerciseTouched = false;
      const exercises = (block.exercises as unknown[]).map((exRaw, j) => {
        if (!isPlainObject(exRaw)) return exRaw;
        const eid = resolveExerciseId(exRaw, blockId, j);
        if (!exerciseMatchesStructuralId(exRaw, blockId, j, exerciseId)) {
          return { ...exRaw, id: eid };
        }
        exerciseTouched = true;
        return { ...mergeFactoryExercise(exRaw, op), id: eid };
      });
      if (exerciseTouched) {
        block = { ...block, exercises };
        touched = true;
      }
    } else if (!exerciseId) {
      block = { ...mergeFactoryBlockLevel(block, op, section), id: blockId };
      touched = true;
    }
  }

  return { block, touched };
}

function patchBlockArray(
  blocks: unknown,
  section: SectionKind,
  ops: readonly CoachStructuralPatchOp[],
): { blocks: unknown[]; touched: boolean; remaining: CoachStructuralPatchOp[] } {
  if (!Array.isArray(blocks)) {
    return { blocks: [], touched: false, remaining: [...ops] };
  }

  const remaining: CoachStructuralPatchOp[] = [];
  const byIndex = new Map<number, CoachStructuralPatchOp[]>();

  for (const op of ops) {
    const blockId = typeof op.block_id === 'string' ? op.block_id.trim() : '';
    if (!blockId) continue;
    const idx = findBlockIndex(blocks, section, blockId);
    if (idx < 0) {
      remaining.push(op);
      continue;
    }
    const list = byIndex.get(idx) ?? [];
    list.push(op);
    byIndex.set(idx, list);
  }

  if (byIndex.size === 0) {
    return { blocks: [...blocks], touched: false, remaining };
  }

  let touched = false;
  const out = blocks.map((raw, index) => {
    const opsForBlock = byIndex.get(index);
    if (!opsForBlock || !isPlainObject(raw)) return raw;
    const result = applyOpsToBlock(raw, section, index, opsForBlock);
    touched = touched || result.touched;
    return result.block;
  });

  return { blocks: out, touched, remaining };
}

export type ApplyStructuralPatchResult = {
  metadata: Record<string, unknown>;
  touched: boolean;
};

/**
 * Apply structural_patch ops onto rich `ai_workout_factory.workout_set` by id
 * (with name/slug fallback when Gemini invents ids).
 */
export function applyStructuralPatchToTaskMetadata(
  base: unknown,
  patches: readonly CoachStructuralPatchOp[] | null | undefined,
): ApplyStructuralPatchResult {
  const meta = isPlainObject(base) ? deepClone(base) : {};
  if (!patches || patches.length === 0) {
    return { metadata: meta, touched: false };
  }

  const af = meta.ai_workout_factory;
  if (!isPlainObject(af)) return { metadata: meta, touched: false };
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return { metadata: meta, touched: false };

  const applyToSession = (
    session: Record<string, unknown>,
  ): { session: Record<string, unknown>; touched: boolean } => {
    let touched = false;
    let remaining: CoachStructuralPatchOp[] = [...patches];
    const nextSession: Record<string, unknown> = { ...session };

    const run = (key: string, section: SectionKind) => {
      if (!Array.isArray(session[key]) || remaining.length === 0) return;
      const r = patchBlockArray(session[key], section, remaining);
      nextSession[key] = r.blocks;
      touched = touched || r.touched;
      remaining = r.remaining;
    };

    // Prefer main exerciseBlocks first (warm-up / finisher often live here as named mains),
    // then instruction section arrays.
    run('exerciseBlocks', 'main');
    run('warmupBlocks', 'warmup');
    run('finisherBlocks', 'finisher');
    run('cooldownBlocks', 'cooldown');

    return { session: nextSession, touched };
  };

  let touched = false;
  const nextWs: Record<string, unknown> = { ...ws };
  const workouts = ws.workouts;
  if (Array.isArray(workouts) && workouts.length > 0 && isPlainObject(workouts[0])) {
    const r = applyToSession(workouts[0]);
    nextWs.workouts = [r.session, ...workouts.slice(1)];
    touched = r.touched;
  } else {
    const r = applyToSession(ws);
    Object.assign(nextWs, r.session);
    touched = r.touched;
  }

  if (!touched) return { metadata: meta, touched: false };

  meta.ai_workout_factory = { ...af, workout_set: nextWs };
  return { metadata: meta, touched: true };
}
