/**
 * Default exercise name placeholders for parametric outline blocks.
 *
 * Deno mirror: `supabase/functions/agents/coach/outline-exercise-placeholders.ts`.
 */

import {
  hydrateEmomAlternatingStations,
  isBlockFormat,
  normalizeFormatParams,
  type BlockFormat,
} from './block-blueprint-library.ts';

function defaultExercisePlaceholders(format: BlockFormat): { name: string }[] {
  switch (format) {
    case 'superset':
    case 'contrast':
      return [{ name: 'Movement A' }, { name: 'Movement B' }];
    case 'circuit':
    case 'chipper':
      return [{ name: 'Station 1' }, { name: 'Station 2' }, { name: 'Station 3' }];
    default:
      return [{ name: 'Movement' }];
  }
}

function exerciseCount(block: Record<string, unknown>): number {
  if (!Array.isArray(block.exercises)) return 0;
  return block.exercises.filter(
    (ex) =>
      ex &&
      typeof ex === 'object' &&
      !Array.isArray(ex) &&
      typeof (ex as { name?: unknown }).name === 'string' &&
      (ex as { name: string }).name.trim().length > 0,
  ).length;
}

function namedExercises(block: Record<string, unknown>): { name: string }[] {
  if (!Array.isArray(block.exercises)) return [];
  const out: { name: string }[] = [];
  for (const ex of block.exercises) {
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) continue;
    const name = typeof (ex as { name?: unknown }).name === 'string' ? ex.name.trim() : '';
    if (name) out.push({ name });
  }
  return out;
}

/** Minimum exercise rows required before fill / factory (outline may start with one Phase B placeholder). */
function minOutlineExerciseCount(format: BlockFormat): number {
  switch (format) {
    case 'superset':
    case 'contrast':
      return 2;
    case 'circuit':
    case 'chipper':
      return 3;
    default:
      return 1;
  }
}

/** Fill missing `exercises[]` placeholders after Phase B or manual structure generation. */
export function ensureOutlineExercisePlaceholders(
  blocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  return blocks.map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
    if (Array.isArray(block.instructions) && block.instructions.length > 0 && !block.block_format) {
      return block;
    }
    const rawFormat = block.block_format;
    if (typeof rawFormat !== 'string' || !isBlockFormat(rawFormat)) return block;

    const format = rawFormat as BlockFormat;
    const min = minOutlineExerciseCount(format);
    const existing = namedExercises(block);
    if (existing.length >= min) return block;

    let formatParams = normalizeFormatParams(format, block.format_params);
    const templates = defaultExercisePlaceholders(format);
    const exercises =
      existing.length === 0
        ? templates
        : [
            ...existing,
            ...templates.slice(existing.length, min).map((row, i) => ({
              name: row.name || `Movement ${existing.length + i + 1}`,
            })),
          ];
    while (exercises.length < min) {
      exercises.push({ name: `Movement ${exercises.length + 1}` });
    }
    if (format === 'emom') {
      formatParams = hydrateEmomAlternatingStations(exercises.length, formatParams);
    }
    const next: Record<string, unknown> = { ...block, exercises, format_params: formatParams };
    return next;
  });
}
