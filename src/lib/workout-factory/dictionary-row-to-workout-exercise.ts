import type { WorkoutExercise } from '@/lib/item-metadata';
import type { ExerciseDictionaryRow } from '@/types/database';
import type {
  KanbanEnrichBiomechanicsOutput,
  KanbanExtractBriefOutput,
} from '@/lib/workout-factory/types/kanban-extract-types';
import {
  dictionaryRowToEnrichedExercise,
  normalizeExerciseDictionaryKey,
} from '@/lib/workout-factory/exercise-dictionary-bridge';
import { mergeKanbanExtractEnrichToTaskExercises } from '@/lib/workout-factory/map-kanban-extract-to-workout';

function equipmentFromBiomechanics(bio: unknown): string | undefined {
  if (!bio || typeof bio !== 'object') return undefined;
  const b = bio as Record<string, unknown>;
  const eq = b.equipment ?? b.equipmentNeeded ?? b.primaryEquipment;
  if (typeof eq === 'string' && eq.trim()) return eq.trim();
  if (Array.isArray(eq)) {
    const parts = eq.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  return undefined;
}

function thumbnailFromMedia(media: unknown): string | undefined {
  if (!media || typeof media !== 'object') return undefined;
  const m = media as Record<string, unknown>;
  for (const k of [
    'thumbnailUrl',
    'thumbnail_url',
    'imageUrl',
    'image_url',
    'coverUrl',
    'cover_url',
  ]) {
    const v = m[k];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/**
 * Maps a full `exercise_dictionary` row into a single `WorkoutExercise` for `tasks.metadata.exercises`.
 * Reuses Kanban extract/enrich merge so instructions, form cues, and injury tips match AI pipeline output.
 */
export function dictionaryRowToWorkoutExercise(row: ExerciseDictionaryRow): WorkoutExercise {
  const name = row.name.trim() || 'Exercise';
  const extract: KanbanExtractBriefOutput = {
    exercises: [
      {
        order: 1,
        section: 'main',
        exercise_name: name,
        equipment: equipmentFromBiomechanics(row.biomechanics) ?? null,
      },
    ],
  };
  const enrich: KanbanEnrichBiomechanicsOutput = {
    exercises: [dictionaryRowToEnrichedExercise(row, 1, name)],
  };
  const [out] = mergeKanbanExtractEnrichToTaskExercises(extract, enrich);
  if (!out) {
    return { name };
  }
  const thumb = thumbnailFromMedia(row.media);
  if (thumb) {
    out.thumbnail_url = thumb;
  }
  return out;
}

/**
 * Orders RPC rows to match the user's picker order (by normalized exercise name).
 */
export function orderDictionaryRowsByPickerSelection(
  rows: ExerciseDictionaryRow[],
  selectedNamesInOrder: string[],
): ExerciseDictionaryRow[] {
  const byNorm = new Map<string, ExerciseDictionaryRow>();
  for (const r of rows) {
    const k = normalizeExerciseDictionaryKey(r.name);
    if (!byNorm.has(k)) byNorm.set(k, r);
  }
  const ordered: ExerciseDictionaryRow[] = [];
  for (const raw of selectedNamesInOrder) {
    const row = byNorm.get(normalizeExerciseDictionaryKey(raw));
    if (row) ordered.push(row);
  }
  return ordered;
}
