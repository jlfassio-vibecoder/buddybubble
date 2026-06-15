/**
 * Deterministic outline fill when Vertex fill is exhausted — assemble from preflight + defaults.
 */

import { isBlockFormat, type BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import { defaultRepsForFormat } from '@/lib/agents/coach/block-blueprint-router';
import { exercisePrescriptionRequired } from '@/lib/workout-factory/outline-block-preflight';

function instructionLinesFromBlock(blk: Record<string, unknown>): string[] {
  if (!Array.isArray(blk.instructions)) return [];
  return blk.instructions
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isInstructionOnlyPreflightBlock(blk: Record<string, unknown>): boolean {
  const instructions = instructionLinesFromBlock(blk);
  if (instructions.length === 0) return false;
  if (!Array.isArray(blk.exercises)) return true;
  const named = blk.exercises.filter(
    (ex) =>
      ex &&
      typeof ex === 'object' &&
      !Array.isArray(ex) &&
      typeof (ex as { name?: unknown }).name === 'string' &&
      (ex as { name: string }).name.trim().length > 0,
  );
  return named.length === 0;
}

function resolveBlockFormat(blk: Record<string, unknown>): BlockFormat {
  const raw = blk.block_format;
  return isBlockFormat(raw) ? raw : 'straight_sets';
}

export function defaultSetsForFormat(format: BlockFormat): number {
  if (format === 'straight_sets' || format === 'drop_sets') return 3;
  return 1;
}

function exerciseNameFromPreflight(ex: unknown): string {
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return '';
  const name = (ex as { name?: unknown }).name;
  return typeof name === 'string' ? name.trim() : '';
}

function buildDefaultExerciseFill(
  preflightEx: Record<string, unknown>,
  block: Record<string, unknown>,
): Record<string, unknown> {
  const name = exerciseNameFromPreflight(preflightEx);
  if (!name) return { ...preflightEx };

  if (!exercisePrescriptionRequired(block)) {
    return { name };
  }

  const format = resolveBlockFormat(block);
  return {
    name,
    sets: defaultSetsForFormat(format),
    reps: defaultRepsForFormat(format),
  };
}

/**
 * Build fill-shaped blocks from authoritative preflight rows with format-aware default prescriptions.
 */
export function buildDeterministicOutlineFillFromPreflight(
  preflightBlocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  return preflightBlocks.map((pre) => {
    if (isInstructionOnlyPreflightBlock(pre)) {
      const row: Record<string, unknown> = {};
      if (typeof pre.name === 'string' && pre.name.trim()) row.name = pre.name.trim();
      const instructions = instructionLinesFromBlock(pre);
      if (instructions.length > 0) row.instructions = instructions;
      return row;
    }

    const row: Record<string, unknown> = {};
    if (typeof pre.name === 'string' && pre.name.trim()) row.name = pre.name.trim();
    if (typeof pre.block_format === 'string') row.block_format = pre.block_format;
    if (
      pre.format_params &&
      typeof pre.format_params === 'object' &&
      !Array.isArray(pre.format_params)
    ) {
      row.format_params = pre.format_params;
    }

    const preExercises = Array.isArray(pre.exercises) ? pre.exercises : [];
    row.exercises = preExercises
      .filter((ex) => ex && typeof ex === 'object' && !Array.isArray(ex))
      .map((ex) => buildDefaultExerciseFill(ex as Record<string, unknown>, pre));

    return row;
  });
}

export function isOutlineFillDeterministicFallbackEnabled(): boolean {
  return process.env.OUTLINE_FILL_DETERMINISTIC_FALLBACK !== 'false';
}
