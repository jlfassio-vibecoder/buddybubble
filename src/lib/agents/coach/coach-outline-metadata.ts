/**
 * Task metadata helpers for Apex outline structure editor (Hop 2).
 *
 * Deno mirror: `supabase/functions/agents/coach/coach-outline-metadata.ts`.
 */

import type { BlockShapeDrop } from './parse';

export const COACH_OUTLINE_STATUS_VALUES = [
  'empty',
  'generating',
  'ready',
  'failed',
  'needs_structure',
] as const;

export type CoachOutlineStatus = (typeof COACH_OUTLINE_STATUS_VALUES)[number];

export type CoachOutlineMetadataFields = {
  outline: Record<string, unknown>[] | null;
  status: CoachOutlineStatus;
  confirmedAt: string | null;
  error: string | null;
  drops: BlockShapeDrop[];
  hasFactory: boolean;
};

/** Keys written by the outline structure editor / Phase B — not TaskModal form fields. */
export const COACH_OUTLINE_METADATA_STORAGE_KEYS = [
  'coach_workout_outline',
  'coach_outline_status',
  'coach_outline_confirmed_at',
  'coach_outline_error',
  'coach_outline_drops',
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** True when `ai_workout_factory.workout_set.workouts[]` is non-empty (rich factory on card). */
function hasRichWorkoutFactoryInMetadata(meta: Record<string, unknown>): boolean {
  const af = meta.ai_workout_factory;
  if (!isPlainObject(af)) return false;
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return false;
  const workouts = ws.workouts;
  return Array.isArray(workouts) && workouts.length > 0;
}

export function readCoachOutlineMetadata(meta: unknown): CoachOutlineMetadataFields {
  const o = isPlainObject(meta) ? meta : {};
  const rawOutline = o.coach_workout_outline;
  const outline =
    Array.isArray(rawOutline) && rawOutline.length > 0
      ? (rawOutline.filter((b) => b && typeof b === 'object' && !Array.isArray(b)) as Record<
          string,
          unknown
        >[])
      : null;

  const rawStatus = o.coach_outline_status;
  const status =
    typeof rawStatus === 'string' &&
    (COACH_OUTLINE_STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as CoachOutlineStatus)
      : outline
        ? 'ready'
        : 'empty';

  const confirmedAt =
    typeof o.coach_outline_confirmed_at === 'string' && o.coach_outline_confirmed_at.trim()
      ? o.coach_outline_confirmed_at.trim()
      : null;

  const error =
    typeof o.coach_outline_error === 'string' && o.coach_outline_error.trim()
      ? o.coach_outline_error.trim()
      : null;

  const rawDrops = o.coach_outline_drops;
  const drops = Array.isArray(rawDrops)
    ? (rawDrops.filter(
        (d) =>
          d &&
          typeof d === 'object' &&
          !Array.isArray(d) &&
          typeof (d as { field?: unknown }).field === 'string' &&
          typeof (d as { reason?: unknown }).reason === 'string',
      ) as BlockShapeDrop[])
    : [];

  const hasFactory = hasRichWorkoutFactoryInMetadata(o);

  return { outline, status, confirmedAt, error, drops, hasFactory };
}

export function mergeCoachOutlineMetadataPatch(
  base: unknown,
  patch: {
    outline?: Record<string, unknown>[] | null;
    status?: CoachOutlineStatus;
    confirmedAt?: string | null;
    error?: string | null;
    drops?: BlockShapeDrop[];
    clearConfirmation?: boolean;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};

  if (patch.outline !== undefined) {
    if (patch.outline != null && patch.outline.length > 0) {
      next.coach_workout_outline = patch.outline;
    } else {
      delete next.coach_workout_outline;
    }
  }

  if (patch.status !== undefined) {
    next.coach_outline_status = patch.status;
  }

  if (patch.confirmedAt !== undefined) {
    if (patch.confirmedAt) {
      next.coach_outline_confirmed_at = patch.confirmedAt;
    } else {
      delete next.coach_outline_confirmed_at;
    }
  }

  if (patch.error !== undefined) {
    if (patch.error) {
      next.coach_outline_error = patch.error;
    } else {
      delete next.coach_outline_error;
    }
  }

  if (patch.drops !== undefined) {
    if (patch.drops.length > 0) {
      next.coach_outline_drops = patch.drops;
    } else {
      delete next.coach_outline_drops;
    }
  }

  if (patch.clearConfirmation) {
    delete next.coach_outline_confirmed_at;
  }

  return next;
}

/**
 * Overlay outline-only metadata onto live form-built save payload so outline saves
 * do not clobber unsaved TaskModal fields (duration, type, exercises, etc.).
 */
export function mergeOutlineMetadataOntoFormSavePayload(
  activeFormMetadata: unknown,
  outlineSaveMetadata: unknown,
): Record<string, unknown> {
  const formBase = isPlainObject(activeFormMetadata) ? { ...activeFormMetadata } : {};
  const outlineObj = isPlainObject(outlineSaveMetadata) ? outlineSaveMetadata : {};

  for (const key of COACH_OUTLINE_METADATA_STORAGE_KEYS) {
    if (key in outlineObj) {
      formBase[key] = outlineObj[key];
    } else {
      delete formBase[key];
    }
  }

  return formBase;
}

/**
 * Keys written by `applyCuePatchesToMetadata` that must survive footer Save.
 * Outline-only merge deliberately ignores these so structure confirms cannot
 * clobber unsaved TaskModal exercise form edits; cue Save must re-apply them.
 */
export const WORKOUT_CUE_METADATA_OVERRIDE_KEYS = ['exercises', 'ai_workout_factory'] as const;

/**
 * Like {@link mergeOutlineMetadataOntoFormSavePayload}, then overlay cue-bearing
 * exercise / factory tree fields from a workout-viewer Save override.
 */
export function mergeWorkoutCueMetadataOntoFormSavePayload(
  activeFormMetadata: unknown,
  cueSaveMetadata: unknown,
): Record<string, unknown> {
  const formBase = mergeOutlineMetadataOntoFormSavePayload(activeFormMetadata, cueSaveMetadata);
  const cueObj = isPlainObject(cueSaveMetadata) ? cueSaveMetadata : {};

  for (const key of WORKOUT_CUE_METADATA_OVERRIDE_KEYS) {
    if (key in cueObj) {
      formBase[key] = cueObj[key];
    }
  }

  return formBase;
}
