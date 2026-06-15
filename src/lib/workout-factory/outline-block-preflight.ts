/**
 * Deterministic preflight / post-fill for parametric outline blocks.
 */

import { hydrateEmomAlternatingStations } from '@/lib/agents/_shared/workout-metadata/hydrate-emom-alternating-stations';
import {
  isBlockFormat,
  normalizeFormatParams,
  validateBlockShape,
  type BlockFormat,
} from '@/lib/agents/coach/block-blueprint-library';
import type { BlockShapeDrop } from '@/lib/agents/coach/parse';
import { parseCoachWorkoutOutlineWithDrops } from '@/lib/agents/coach/parse';

export type OutlinePreflightResult = {
  blocks: Record<string, unknown>[];
  drops: BlockShapeDrop[];
};

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

function instructionLinesFromBlock(blk: Record<string, unknown>): string[] {
  if (!Array.isArray(blk.instructions)) return [];
  return blk.instructions
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function exerciseCount(blk: Record<string, unknown>): number {
  if (!Array.isArray(blk.exercises)) return 0;
  return blk.exercises.filter(
    (ex) =>
      ex &&
      typeof ex === 'object' &&
      !Array.isArray(ex) &&
      typeof (ex as { name?: unknown }).name === 'string',
  ).length;
}

function resolveBlockFormat(blk: Record<string, unknown>): BlockFormat | null {
  const raw = blk.block_format;
  if (isBlockFormat(raw)) return raw;
  return null;
}

function authoritativeFormatParams(
  blk: Record<string, unknown>,
  blockFormat: BlockFormat | null,
): Record<string, unknown> {
  if (blockFormat == null) return {};
  const params = normalizeFormatParams(blockFormat, blk.format_params);
  const { alternating_stations: _a, is_combo: _c, ...rest } = params;
  return rest;
}

function structuralSnapshot(blk: Record<string, unknown>): {
  name: string;
  block_format: string | null;
  format_params: Record<string, unknown>;
  instructionOnly: boolean;
} {
  const blockFormat = resolveBlockFormat(blk);
  const innerCount = exerciseCount(blk);
  const instructions = instructionLinesFromBlock(blk);
  const instructionOnly = instructions.length > 0 && innerCount === 0;
  return {
    name: typeof blk.name === 'string' ? blk.name.trim() : '',
    block_format: blockFormat,
    format_params: authoritativeFormatParams(blk, blockFormat),
    instructionOnly,
  };
}

function isInstructionOnlyPreflightBlock(blk: Record<string, unknown>): boolean {
  const instructions = instructionLinesFromBlock(blk);
  if (instructions.length === 0) return false;
  return exerciseCount(blk) === 0;
}

const EXERCISE_OVERLAY_KEYS = [
  'name',
  'sets',
  'reps',
  'equipment',
  'work_seconds',
  'rest_seconds',
  'rounds',
  'rpe',
  'coach_notes',
] as const;

function overlayExerciseFields(
  preflightEx: Record<string, unknown>,
  modelEx: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...preflightEx };
  for (const key of EXERCISE_OVERLAY_KEYS) {
    if (key in modelEx && modelEx[key] !== undefined) {
      out[key] = modelEx[key];
    }
  }
  return out;
}

function modelBlockHasNamedExercises(blk: Record<string, unknown>): boolean {
  if (!Array.isArray(blk.exercises)) return false;
  return blk.exercises.some(
    (ex) =>
      ex &&
      typeof ex === 'object' &&
      !Array.isArray(ex) &&
      typeof (ex as { name?: unknown }).name === 'string' &&
      (ex as { name: string }).name.trim().length > 0,
  );
}

/**
 * Graft model fill content onto authoritative preflight blocks by index.
 * Preflight owns name / block_format / format_params; model supplies exercises or instructions.
 */
export function graftFillBlocksOntoPreflight(
  preflightBlocks: Record<string, unknown>[],
  modelBlocks: Record<string, unknown>[],
): { ok: true; blocks: Record<string, unknown>[] } | { ok: false; error: string } {
  if (preflightBlocks.length !== modelBlocks.length) {
    return {
      ok: false,
      error: `block count changed (${preflightBlocks.length} → ${modelBlocks.length})`,
    };
  }

  const blocks: Record<string, unknown>[] = [];

  for (let i = 0; i < preflightBlocks.length; i++) {
    const pre = preflightBlocks[i]!;
    const model = modelBlocks[i]!;

    if (isInstructionOnlyPreflightBlock(pre)) {
      if (modelBlockHasNamedExercises(model)) {
        return { ok: false, error: `blocks[${i}] instruction-only shape changed` };
      }
      const modelInstructions = instructionLinesFromBlock(model);
      const preInstructions = instructionLinesFromBlock(pre);
      const row: Record<string, unknown> = {};
      const name = typeof pre.name === 'string' ? pre.name.trim() : '';
      if (name) row.name = name;
      row.instructions = modelInstructions.length > 0 ? modelInstructions : preInstructions;
      blocks.push(row);
      continue;
    }

    const preExercises = Array.isArray(pre.exercises) ? pre.exercises : [];
    const modelExercisesRaw = Array.isArray(model.exercises) ? model.exercises : [];

    if (modelExercisesRaw.length === 0) {
      return { ok: false, error: `blocks[${i}] missing exercises[]` };
    }
    if (modelExercisesRaw.length !== preExercises.length) {
      return {
        ok: false,
        error: `blocks[${i}] exercise count changed (${preExercises.length} → ${modelExercisesRaw.length})`,
      };
    }

    const graftedExercises: Record<string, unknown>[] = [];
    for (let j = 0; j < preExercises.length; j++) {
      const modelEx = modelExercisesRaw[j];
      if (!modelEx || typeof modelEx !== 'object' || Array.isArray(modelEx)) {
        return { ok: false, error: `blocks[${i}].exercises[${j}] invalid` };
      }
      const preEx =
        preExercises[j] && typeof preExercises[j] === 'object' && !Array.isArray(preExercises[j])
          ? (preExercises[j] as Record<string, unknown>)
          : {};
      graftedExercises.push(overlayExerciseFields(preEx, modelEx as Record<string, unknown>));
    }

    const row: Record<string, unknown> = { ...pre, exercises: graftedExercises };
    blocks.push(row);
  }

  return { ok: true, blocks };
}

function hasPositiveIntParam(params: Record<string, unknown>, key: string): boolean {
  return typeof params[key] === 'number' && (params[key] as number) > 0;
}

/** False when EMOM/Tabata timing in format_params lets the assembler hydrate prescriptions. */
export function exercisePrescriptionRequired(block: Record<string, unknown>): boolean {
  const fmt = block.block_format;
  if (fmt !== 'emom' && fmt !== 'tabata') return true;
  const rawParams = block.format_params;
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) return true;
  const params = rawParams as Record<string, unknown>;
  if (fmt === 'emom') {
    const hasInterval = hasPositiveIntParam(params, 'interval_seconds');
    const hasDuration =
      hasPositiveIntParam(params, 'total_minutes') || hasPositiveIntParam(params, 'total_rounds');
    if (hasInterval && hasDuration) return false;
    return true;
  }
  if (hasPositiveIntParam(params, 'rounds')) return false;
  return true;
}

export type OutlineFillValidationReason = 'structure' | 'prescription' | 'parse' | 'unknown';

/** Map graft/validation error text to client-facing validation_reason. */
export function classifyOutlineFillValidationReason(error: string): OutlineFillValidationReason {
  const lower = error.toLowerCase();
  if (lower.includes('parse json') || lower.includes('unparseable json')) return 'parse';
  if (lower.includes('needs sets, reps, or work_seconds') || lower.includes('missing name')) {
    return 'prescription';
  }
  if (
    lower.includes('block count') ||
    lower.includes('instruction-only') ||
    lower.includes('exercise count') ||
    lower.includes('missing exercises') ||
    lower.includes('block_format') ||
    lower.includes('format_params') ||
    lower.includes('must be an object') ||
    lower.includes('non-empty array')
  ) {
    return 'structure';
  }
  return 'unknown';
}

/** Normalize incoming outline via Coach parse (same boundary as create_card persist). */
export function preflightOutlineBlocks(raw: Record<string, unknown>[]): OutlinePreflightResult {
  const { outline, drops } = parseCoachWorkoutOutlineWithDrops({ coach_workout_outline: raw });
  return { blocks: outline ?? [], drops };
}

/** Hydrate EMOM matrices and validate block shape after Vertex fill. */
export function hydrateAndValidateOutlineBlocks(blocks: Record<string, unknown>[]): {
  blocks: Record<string, unknown>[];
  drops: BlockShapeDrop[];
} {
  const drops: BlockShapeDrop[] = [];
  const out: Record<string, unknown>[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    if (!blk || typeof blk !== 'object' || Array.isArray(blk)) {
      drops.push({ field: `blocks[${i}]`, reason: 'unknown_block_format' });
      continue;
    }

    const innerCount = exerciseCount(blk);
    const instructions = instructionLinesFromBlock(blk);
    const instructionOnly = instructions.length > 0 && innerCount === 0;

    if (instructionOnly) {
      const row: Record<string, unknown> = {};
      const name = typeof blk.name === 'string' ? blk.name.trim() : '';
      if (name) row.name = name;
      row.instructions = instructions;
      if (Object.keys(row).length > 0) out.push(row);
      else drops.push({ field: `blocks[${i}]`, reason: 'unknown_block_format' });
      continue;
    }

    const blockFormat = resolveBlockFormat(blk);
    if (blockFormat == null) {
      drops.push({ field: `blocks[${i}]`, reason: 'unknown_block_format' });
      continue;
    }

    const inner = Array.isArray(blk.exercises) ? blk.exercises : [];

    let formatParams = normalizeFormatParams(blockFormat, blk.format_params);
    if (blockFormat === 'emom' && innerCount > 0) {
      formatParams = hydrateEmomAlternatingStations(innerCount, formatParams);
    }

    const shapeReason = validateBlockShape(blockFormat, innerCount, formatParams);
    if (shapeReason != null) {
      drops.push({ field: `blocks[${i}]`, reason: shapeReason });
      continue;
    }

    const row: Record<string, unknown> = { ...blk, block_format: blockFormat };
    if (Object.keys(formatParams).length > 0) row.format_params = formatParams;
    if (inner.length > 0) row.exercises = inner;
    if (instructions.length > 0) row.instructions = instructions;
    out.push(row);
  }

  return { blocks: out, drops };
}

/** Returns error message when fill output diverges from preflight structure. */
export function assertFillPreservesStructure(
  preflightBlocks: Record<string, unknown>[],
  filledBlocks: Record<string, unknown>[],
): string | null {
  if (preflightBlocks.length !== filledBlocks.length) {
    return `block count changed (${preflightBlocks.length} → ${filledBlocks.length})`;
  }

  for (let i = 0; i < preflightBlocks.length; i++) {
    const pre = structuralSnapshot(preflightBlocks[i]!);
    const post = structuralSnapshot(filledBlocks[i]!);

    if (pre.name !== post.name) {
      return `blocks[${i}] name changed ("${pre.name}" → "${post.name}")`;
    }
    if (pre.block_format !== post.block_format) {
      return `blocks[${i}] block_format changed`;
    }
    if (stableStringify(pre.format_params) !== stableStringify(post.format_params)) {
      return `blocks[${i}] format_params changed`;
    }
    if (pre.instructionOnly !== post.instructionOnly) {
      return `blocks[${i}] instruction-only shape changed`;
    }
  }

  return null;
}

/** Convert validated snake_case blocks to typed OutlineFillOutput for chain metadata. */
export function outlineBlocksToFillOutput(
  blocks: Record<string, unknown>[],
): import('@/lib/workout-factory/types/outline-fill-types').OutlineFillOutput {
  return {
    blocks: blocks.map((blk) => {
      const row: Record<string, unknown> = {};
      if (typeof blk.name === 'string') row.name = blk.name;
      if (typeof blk.block_format === 'string') row.block_format = blk.block_format;
      if (
        blk.format_params &&
        typeof blk.format_params === 'object' &&
        !Array.isArray(blk.format_params)
      ) {
        row.format_params = blk.format_params;
      }
      if (Array.isArray(blk.instructions)) row.instructions = blk.instructions;
      if (Array.isArray(blk.exercises)) row.exercises = blk.exercises;
      return row;
    }),
  };
}
