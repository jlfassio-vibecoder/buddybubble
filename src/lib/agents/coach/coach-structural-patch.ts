/**
 * Surgical Coach canvas / metadata patches keyed by block_id / exercise_id.
 */

import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { formatBlockSubtitle } from '@/lib/workout-factory/format-block-subtitle';
import { isBlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import type { CoachStructuralPatchOp } from '@/lib/agents/_shared/workout-metadata/structural-patch-types';
import {
  exerciseMatchesStructuralId,
  structuralTokensMatch,
} from '@/lib/agents/_shared/workout-metadata/structural-id-match';

export type { CoachStructuralPatchOp };

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
  if (op.format_params) {
    return clampRpe(op.format_params.target_rpe);
  }
  return null;
}

function findCanvasBlockIndex(
  blocks: readonly WorkoutSessionBlockView[],
  patchBlockId: string,
): number {
  const want = patchBlockId.trim();
  if (!want) return -1;
  const exact = blocks.findIndex((b) => b.id === want);
  if (exact >= 0) return exact;
  return blocks.findIndex((b) => structuralTokensMatch(b.name, want));
}

function findCanvasExerciseIndex(block: WorkoutSessionBlockView, patchExerciseId: string): number {
  const want = patchExerciseId.trim();
  if (!want) return -1;
  return block.exercises.findIndex((ex, i) => {
    const asRecord: Record<string, unknown> = {
      id: ex.id,
      exerciseName: ex.exerciseName,
      name: ex.exerciseName,
    };
    return exerciseMatchesStructuralId(asRecord, block.id, i, want);
  });
}

/** When Gemini invents a placeholder block_id, still locate the row by exercise_id. */
function findCanvasBlockIndexByExerciseId(
  blocks: readonly WorkoutSessionBlockView[],
  patchExerciseId: string,
): number {
  const want = patchExerciseId.trim();
  if (!want) return -1;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (findCanvasExerciseIndex(block, want) >= 0) return i;
  }
  return -1;
}

function mergeExerciseFields(ex: Exercise, op: CoachStructuralPatchOp): Exercise {
  const next: Exercise = { ...ex };
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

function mergeBlockLevel(
  block: WorkoutSessionBlockView,
  op: CoachStructuralPatchOp,
): WorkoutSessionBlockView {
  let next = block;
  let changed = false;
  if (typeof op.name === 'string' && op.name.trim() && op.name.trim() !== block.name) {
    next = { ...next, name: op.name.trim() };
    changed = true;
  }
  if (typeof op.block_format === 'string' && op.block_format.trim()) {
    const fmt = op.block_format.trim();
    if (isBlockFormat(fmt) && fmt !== block.blockFormat) {
      next = { ...next, blockFormat: fmt };
      changed = true;
    }
  }
  if (op.format_params) {
    next = {
      ...next,
      formatParams: { ...next.formatParams, ...op.format_params },
    };
    changed = true;
  }
  // Block-level RPE (top-level or format_params.target_rpe) → every exercise row the editor binds.
  const fanoutRpe = resolveOpRpe(op);
  if (fanoutRpe != null && next.exercises.length > 0) {
    let exercisesChanged = false;
    const exercises = next.exercises.map((ex) => {
      if (ex.rpe === fanoutRpe) return ex;
      exercisesChanged = true;
      return { ...ex, rpe: fanoutRpe };
    });
    if (exercisesChanged) {
      next = { ...next, exercises };
      changed = true;
    }
  }
  if (changed) {
    next = {
      ...next,
      subtitle: formatBlockSubtitle(next.blockFormat, next.formatParams),
    };
  }
  return next;
}

function buildAddedExercise(
  blockId: string,
  index: number,
  op: CoachStructuralPatchOp,
): Exercise | null {
  const name = typeof op.name === 'string' ? op.name.trim() : '';
  if (!name) return null;
  const sets = positiveInt(op.sets) ?? 3;
  const reps =
    typeof op.reps === 'string' && op.reps.trim()
      ? op.reps.trim()
      : typeof op.reps === 'number' && Number.isFinite(op.reps)
        ? String(op.reps)
        : '8';
  const ex: Exercise = {
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

/**
 * Apply field-level Coach patches to canvas draft blocks.
 * Unmatched ops are no-ops. Unchanged blocks keep reference equality.
 * Matches block_id / exercise_id exactly or by normalized name slug.
 */
export function applyCoachPatchToCanvas(
  currentBlocks: WorkoutSessionBlockView[],
  patches: readonly CoachStructuralPatchOp[],
): WorkoutSessionBlockView[] {
  if (!Array.isArray(currentBlocks) || currentBlocks.length === 0) return currentBlocks;
  if (!Array.isArray(patches) || patches.length === 0) return currentBlocks;

  let out = currentBlocks;
  let arrayCloned = false;

  for (const op of patches) {
    const patchBlockId = typeof op.block_id === 'string' ? op.block_id.trim() : '';
    const exerciseId =
      typeof op.exercise_id === 'string' && op.exercise_id.trim() ? op.exercise_id.trim() : null;

    let blockIndex = patchBlockId ? findCanvasBlockIndex(out, patchBlockId) : -1;
    // Model often emits placeholder block ids (e.g. "main_emom_block_id") with a real
    // exercise UUID — fall back to exercise_id scan so coach_notes still lands.
    if (blockIndex < 0 && exerciseId) {
      blockIndex = findCanvasBlockIndexByExerciseId(out, exerciseId);
    }
    if (blockIndex < 0) continue;

    const block = out[blockIndex]!;
    const opKind = op.op === 'add_exercise' ? 'add_exercise' : 'update';
    let nextBlock = block;

    if (opKind === 'add_exercise') {
      // Any block that already exposes exercise rows (incl. warm-up / finisher mains).
      if (block.exercises.length === 0 && block.section !== 'main') continue;
      const added = buildAddedExercise(block.id, block.exercises.length, op);
      if (!added) continue;
      nextBlock = { ...block, exercises: [...block.exercises, added] };
    } else if (exerciseId) {
      const exIndex = findCanvasExerciseIndex(block, exerciseId);
      if (exIndex < 0) continue;
      const merged = mergeExerciseFields(block.exercises[exIndex]!, op);
      if (merged === block.exercises[exIndex]) continue;
      const nextExercises = block.exercises.slice();
      nextExercises[exIndex] = merged;
      nextBlock = { ...block, exercises: nextExercises };
    } else {
      nextBlock = mergeBlockLevel(block, op);
      if (nextBlock === block) continue;
    }

    if (!arrayCloned) {
      out = currentBlocks.slice();
      arrayCloned = true;
    }
    out[blockIndex] = nextBlock;
  }

  return out;
}

export type MergeCoachPrescriptionOptions = {
  /**
   * When true, only copy `coachNotes` (safe while the draft is dirty — does not
   * overwrite local sets/reps/rpe keystrokes). Full prescription is for pristine edit.
   */
  notesOnly?: boolean;
};

/**
 * Write-through Coach prescription fields from saved/source blocks into an open edit draft.
 * Mirrors Active Session applying execution_patch onto live draft logs without leaving edit mode.
 * Only copies sets/reps/rpe/notes/timing (and formatParams) by matching block/exercise ids —
 * does not replace structure the user may be rearranging.
 */
export function mergeCoachPrescriptionIntoDraft(
  draftBlocks: WorkoutSessionBlockView[],
  sourceBlocks: readonly WorkoutSessionBlockView[],
  options?: MergeCoachPrescriptionOptions,
): WorkoutSessionBlockView[] {
  if (!Array.isArray(draftBlocks) || draftBlocks.length === 0) return draftBlocks;
  if (!Array.isArray(sourceBlocks) || sourceBlocks.length === 0) return draftBlocks;
  const notesOnly = options?.notesOnly === true;

  const sourceById = new Map<string, WorkoutSessionBlockView>();
  for (const b of sourceBlocks) {
    if (typeof b.id === 'string' && b.id.trim()) sourceById.set(b.id.trim(), b);
  }

  let out = draftBlocks;
  let arrayCloned = false;

  for (let bi = 0; bi < draftBlocks.length; bi++) {
    const draft = draftBlocks[bi]!;
    let src = sourceById.get(draft.id);
    if (!src) {
      src = sourceBlocks.find((b) => structuralTokensMatch(b.name, draft.name));
    }
    if (!src) continue;

    let nextBlock = draft;
    let blockChanged = false;

    if (
      !notesOnly &&
      src.formatParams &&
      JSON.stringify(src.formatParams) !== JSON.stringify(draft.formatParams)
    ) {
      nextBlock = {
        ...nextBlock,
        formatParams: { ...draft.formatParams, ...src.formatParams },
      };
      blockChanged = true;
    }

    if (src.exercises.length > 0 && draft.exercises.length > 0) {
      const srcExById = new Map<string, Exercise>();
      src.exercises.forEach((ex, i) => {
        const id = typeof ex.id === 'string' && ex.id.trim() ? ex.id.trim() : `${src!.id}:e${i}`;
        srcExById.set(id, ex);
      });

      let exercisesChanged = false;
      const nextExercises = draft.exercises.map((ex, i) => {
        const id = typeof ex.id === 'string' && ex.id.trim() ? ex.id.trim() : `${draft.id}:e${i}`;
        let fromSrc = srcExById.get(id);
        if (!fromSrc) {
          fromSrc = src!.exercises.find((sEx) =>
            structuralTokensMatch(sEx.exerciseName, ex.exerciseName),
          );
        }
        if (!fromSrc) return ex;
        let next = ex;
        let changed = false;
        if (!notesOnly) {
          const copyNum = (key: 'sets' | 'rpe' | 'restSeconds' | 'workSeconds') => {
            const v = fromSrc![key];
            if (typeof v === 'number' && Number.isFinite(v) && v !== ex[key]) {
              if (!changed) {
                next = { ...ex };
                changed = true;
              }
              next[key] = v;
            }
          };
          copyNum('sets');
          copyNum('rpe');
          copyNum('restSeconds');
          copyNum('workSeconds');
          if (typeof fromSrc.reps === 'string' && fromSrc.reps !== ex.reps) {
            if (!changed) {
              next = { ...ex };
              changed = true;
            }
            next.reps = fromSrc.reps;
          }
        }
        if (
          typeof fromSrc.coachNotes === 'string' &&
          fromSrc.coachNotes.trim() &&
          fromSrc.coachNotes !== ex.coachNotes
        ) {
          if (!changed) {
            next = { ...ex };
            changed = true;
          }
          next.coachNotes = fromSrc.coachNotes;
        }
        if (changed) exercisesChanged = true;
        return next;
      });

      if (exercisesChanged) {
        nextBlock = { ...nextBlock, exercises: nextExercises };
        blockChanged = true;
      }
    }

    if (!blockChanged) continue;
    if (!arrayCloned) {
      out = draftBlocks.slice();
      arrayCloned = true;
    }
    out[bi] = nextBlock;
  }

  return out;
}

/** True when the op carries a non-empty coach_notes write (safe to apply on a dirty draft). */
export function structuralPatchOpWritesCoachNotes(op: CoachStructuralPatchOp): boolean {
  return typeof op.coach_notes === 'string' && op.coach_notes.trim().length > 0;
}

/**
 * Narrow ops to identity + coach_notes only. Used when applying onto a dirty draft so
 * mixed model patches (notes + rpe/sets) cannot overwrite local keystrokes.
 */
export function coachNotesOnlyStructuralOps(
  patches: readonly CoachStructuralPatchOp[],
): CoachStructuralPatchOp[] {
  const out: CoachStructuralPatchOp[] = [];
  for (const op of patches) {
    if (!structuralPatchOpWritesCoachNotes(op)) continue;
    const next: CoachStructuralPatchOp = {
      block_id: op.block_id,
      coach_notes: op.coach_notes,
    };
    if (typeof op.op === 'string' && op.op.trim()) next.op = op.op;
    if (typeof op.exercise_id === 'string' && op.exercise_id.trim()) {
      next.exercise_id = op.exercise_id;
    }
    out.push(next);
  }
  return out;
}
