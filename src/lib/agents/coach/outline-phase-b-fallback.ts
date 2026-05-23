/**
 * Deterministic Phase B fallback when Vertex outline fill fails or returns hollow blocks.
 * Resolves `:main/emom/alternating-combo` style tokens from thread text + catalog presets.
 *
 * Deno mirror: `supabase/functions/agents/coach/outline-phase-b-fallback.ts`.
 */

import { hydrateEmomAlternatingStations, normalizeFormatParams } from './block-blueprint-library';
import {
  BLOCK_BLUEPRINT_CATALOG,
  type BlockBlueprintCatalogEntry,
  searchBlockCatalog,
} from './block-blueprint-catalog';

const CATALOG_TOKEN_IN_TEXT_RE =
  /:(?:main|finisher|metcon|warmup|strength|recovery|prep)\/[a-z0-9_-]+\/[a-z0-9_-]+/gi;

function namedExerciseCount(block: Record<string, unknown>): number {
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

/** Resolve a catalog row from a composer token substring. */
export function resolveBlockCatalogEntryByToken(
  tokenOrFragment: string,
): BlockBlueprintCatalogEntry | null {
  let raw = tokenOrFragment.trim().toLowerCase();
  if (!raw.startsWith(':')) raw = `:${raw}`;
  const withSpace = raw.endsWith(' ') ? raw : `${raw} `;
  const exact = BLOCK_BLUEPRINT_CATALOG.find((e) => e.token.toLowerCase() === withSpace);
  if (exact) return exact;
  const hits = searchBlockCatalog(raw);
  return hits.length > 0 ? hits[0]! : null;
}

/** Extract the first resolvable catalog token from free text (user message or history). */
export function findBlockCatalogEntryInText(text: string): BlockBlueprintCatalogEntry | null {
  const matches = text.match(CATALOG_TOKEN_IN_TEXT_RE);
  if (!matches?.length) return null;
  for (const fragment of matches) {
    const entry = resolveBlockCatalogEntryByToken(fragment);
    if (entry) return entry;
  }
  return null;
}

function parseDurationMinutesFromText(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\s*[- ]?\s*minute/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Placeholder exercise names from title/description equipment cues. */
export function inferPlaceholderExercisesFromHints(hints: string): Array<{ name: string }> {
  const t = hints.toLowerCase();
  const out: Array<{ name: string }> = [];
  if (/kettlebell|\bkb\b/.test(t)) out.push({ name: 'Kettlebell Swing' });
  if (/resistance band|\bband\b/.test(t)) out.push({ name: 'Resistance Band Thruster' });
  if (/dumbbell|\bdb\b/.test(t)) out.push({ name: 'Dumbbell Exercise' });
  if (/bodyweight|no equipment/.test(t) && out.length === 0) {
    out.push({ name: 'Push-up' }, { name: 'Air Squat' });
  }
  if (out.length === 0) out.push({ name: 'Movement A' }, { name: 'Movement B' });
  if (out.length === 1) out.push({ name: 'Movement B' });
  return out;
}

export function buildFallbackOutlineBlockFromCatalog(
  entry: BlockBlueprintCatalogEntry,
  title: string,
  description: string,
): Record<string, unknown> {
  const hints = `${title}\n${description}`;
  const duration = parseDurationMinutesFromText(hints);
  let format_params: Record<string, unknown> = { ...entry.format_params };
  if (duration != null && entry.block_format === 'emom') {
    format_params = { ...format_params, total_minutes: duration };
  }
  format_params = normalizeFormatParams(entry.block_format, format_params);
  const exercises = inferPlaceholderExercisesFromHints(hints);
  if (entry.block_format === 'emom' && exercises.length > 0) {
    format_params = hydrateEmomAlternatingStations(exercises.length, format_params);
  }
  const blockName = title.trim().slice(0, 80) || entry.section_name || entry.label.slice(0, 80);
  return {
    name: blockName,
    block_format: entry.block_format,
    format_params,
    exercises,
  };
}

/** Default EMOM block when no catalog token is found in thread text. */
export function buildMinimalEmomOutlineFallback(
  title: string,
  description: string,
): Record<string, unknown> {
  const hints = `${title}\n${description}`;
  const duration = parseDurationMinutesFromText(hints) ?? 20;
  const exercises = inferPlaceholderExercisesFromHints(hints);
  let format_params = hydrateEmomAlternatingStations(exercises.length, {
    interval_seconds: 60,
    total_minutes: duration,
    is_alternating: true,
  });
  return {
    name: title.trim().slice(0, 80) || 'Main EMOM',
    block_format: 'emom',
    format_params,
    exercises,
  };
}

export function outlineBlocksNeedExerciseFallback(outline: Record<string, unknown>[]): boolean {
  return outline.some((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return true;
    const fmt = block.block_format;
    if (fmt === 'emom') return namedExerciseCount(block) < 2;
    return namedExerciseCount(block) < 1;
  });
}

export function ensureOutlineBlocksHaveExercises(
  outline: Record<string, unknown>[],
  hints: string,
): Record<string, unknown>[] {
  return outline.map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
    const need =
      block.block_format === 'emom' ? namedExerciseCount(block) < 2 : namedExerciseCount(block) < 1;
    if (!need) return block;
    const exercises = inferPlaceholderExercisesFromHints(hints);
    let format_params = block.format_params;
    if (block.block_format === 'emom' && typeof format_params === 'object') {
      format_params = hydrateEmomAlternatingStations(
        exercises.length,
        format_params as Record<string, unknown>,
      );
    }
    return { ...block, exercises, format_params };
  });
}

export type OutlinePhaseBFallbackInput = {
  triggerContent: string;
  historyTexts: string[];
  title: string;
  description: string;
};

/** Catalog token from trigger, then history (newest first), then minimal EMOM fallback. */
export function buildCoachOutlinePhaseBFallback(
  input: OutlinePhaseBFallbackInput,
): Record<string, unknown>[] {
  const texts = [input.triggerContent, ...input.historyTexts];
  for (const text of texts) {
    if (!text.trim()) continue;
    const entry = findBlockCatalogEntryInText(text);
    if (entry) {
      return [buildFallbackOutlineBlockFromCatalog(entry, input.title, input.description)];
    }
  }
  return [buildMinimalEmomOutlineFallback(input.title, input.description)];
}
