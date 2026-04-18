/**
 * Cache-aside bridge: exercise_dictionary rows ↔ Kanban enrich DTOs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ExerciseDictionaryRow, Json } from '@/types/database';
import type {
  KanbanEnrichBiomechanicsOutput,
  KanbanEnrichedExercise,
  KanbanExtractBriefOutput,
  KanbanExtractedExercise,
} from '@/lib/workout-factory/types/kanban-extract-types';

export function normalizeExerciseDictionaryKey(name: string): string {
  return name.trim().toLowerCase();
}

/** URL-safe slug for exercise_dictionary.slug (non-empty). */
export function slugifyExerciseName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'exercise';
}

function jsonbToStrings(v: unknown): string | string[] | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.length === 1 ? parts[0]! : parts;
  }
  return undefined;
}

export function dictionaryRowToEnrichedExercise(
  row: ExerciseDictionaryRow,
  order: number,
  exerciseNameFromExtract: string,
): KanbanEnrichedExercise {
  const instr = row.instructions;
  let detailed: string | string[] | undefined;
  if (Array.isArray(instr)) {
    const steps = instr.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    detailed = steps.length === 0 ? undefined : steps.length === 1 ? steps[0]! : steps;
  } else if (typeof instr === 'string' && instr.trim()) {
    detailed = instr.trim();
  }

  const bio = row.biomechanics as Record<string, unknown> | null;
  const cueParts: string[] = [];
  const pushVal = (v: unknown) => {
    const s = jsonbToStrings(v);
    if (!s) return;
    if (Array.isArray(s)) cueParts.push(...s);
    else cueParts.push(s);
  };
  if (bio) {
    pushVal(bio.performanceCues);
    pushVal(bio.commonMistakes);
  }
  const tips = bio ? jsonbToStrings(bio.injuryPreventionTips) : undefined;

  const out: KanbanEnrichedExercise = {
    order,
    exercise_name: exerciseNameFromExtract.trim(),
  };
  if (detailed) out.detailed_instructions = detailed;
  if (cueParts.length > 0) out.biomechanical_cues = cueParts.length === 1 ? cueParts[0]! : cueParts;
  if (tips) out.injury_prevention_tips = tips;

  if (!out.detailed_instructions && !out.biomechanical_cues && !out.injury_prevention_tips) {
    out.detailed_instructions = [`Perform ${exerciseNameFromExtract.trim()} with control.`];
  }
  return out;
}

export async function rpcExerciseDictionaryLookupByNames(
  client: SupabaseClient,
  names: string[],
): Promise<ExerciseDictionaryRow[]> {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (cleaned.length === 0) return [];

  const { data, error } = await client.rpc('exercise_dictionary_lookup_by_names', {
    p_names: cleaned,
  });
  if (error) throw error;
  return (data ?? []) as ExerciseDictionaryRow[];
}

/**
 * One dictionary row per normalized name (first wins if RPC returns duplicates for different raw names).
 */
export function dictionaryRowsByNormalizedName(
  rows: ExerciseDictionaryRow[],
): Map<string, ExerciseDictionaryRow> {
  const m = new Map<string, ExerciseDictionaryRow>();
  for (const row of rows) {
    const k = normalizeExerciseDictionaryKey(row.name);
    if (!m.has(k)) m.set(k, row);
  }
  return m;
}

export function splitExtractByDictionaryMatches(
  extracted: KanbanExtractBriefOutput,
  normToRow: Map<string, ExerciseDictionaryRow>,
): { foundByOrder: Map<number, ExerciseDictionaryRow>; missing: KanbanExtractedExercise[] } {
  const foundByOrder = new Map<number, ExerciseDictionaryRow>();
  const missing: KanbanExtractedExercise[] = [];
  for (const ex of extracted.exercises) {
    const row = normToRow.get(normalizeExerciseDictionaryKey(ex.exercise_name));
    if (row) foundByOrder.set(ex.order, row);
    else missing.push(ex);
  }
  return { foundByOrder, missing };
}

export function mergeKanbanEnrichFromDictionaryAndVertex(
  fullExtract: KanbanExtractBriefOutput,
  foundByOrder: Map<number, ExerciseDictionaryRow>,
  vertexEnrich: KanbanEnrichBiomechanicsOutput | null,
): KanbanEnrichBiomechanicsOutput {
  const vertexByOrder = vertexEnrich
    ? new Map(vertexEnrich.exercises.map((e) => [e.order, e]))
    : new Map<number, KanbanEnrichedExercise>();
  const ordered = [...fullExtract.exercises].sort((a, b) => a.order - b.order);
  const exercises: KanbanEnrichedExercise[] = [];

  for (const ex of ordered) {
    const dictRow = foundByOrder.get(ex.order);
    if (dictRow) {
      exercises.push(dictionaryRowToEnrichedExercise(dictRow, ex.order, ex.exercise_name));
      continue;
    }
    const v = vertexByOrder.get(ex.order);
    if (!v) {
      throw new Error(
        `mergeKanbanEnrichFromDictionaryAndVertex: missing enrich for order ${ex.order}`,
      );
    }
    exercises.push(v);
  }
  return { exercises };
}

export function enrichedExerciseToDictionaryInsert(
  exerciseName: string,
  enriched: KanbanEnrichedExercise,
  slug: string,
): Database['public']['Tables']['exercise_dictionary']['Insert'] {
  const name = exerciseName.trim();
  const di = enriched.detailed_instructions;
  const instructions =
    di === undefined
      ? []
      : Array.isArray(di)
        ? di.map((s) => s.trim()).filter(Boolean)
        : di.trim()
          ? [di.trim()]
          : [];

  const biomechanics: Record<string, unknown> = {};
  if (enriched.biomechanical_cues !== undefined) {
    biomechanics.performanceCues = enriched.biomechanical_cues;
  }
  if (enriched.injury_prevention_tips !== undefined) {
    biomechanics.injuryPreventionTips = enriched.injury_prevention_tips;
  }

  return {
    slug,
    name,
    status: 'pending',
    instructions: instructions as Json,
    biomechanics: biomechanics as Json,
    media: {},
  };
}

/** Resolves slug, then slug-2, slug-3, … until unused. */
export async function resolveUniqueExerciseDictionarySlug(
  client: SupabaseClient,
  name: string,
): Promise<string> {
  const base = slugifyExerciseName(name);
  for (let attempt = 0; attempt < 64; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await client
      .from('exercise_dictionary')
      .select('slug')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Inserts a pending catalog row from Vertex enrich output; throws on failure (caller logs). */
export async function insertExerciseDictionaryPendingFromEnrichment(
  client: SupabaseClient,
  exerciseName: string,
  enriched: KanbanEnrichedExercise,
): Promise<void> {
  const slug = await resolveUniqueExerciseDictionarySlug(client, exerciseName);
  const row = enrichedExerciseToDictionaryInsert(exerciseName, enriched, slug);
  const { error } = await client.from('exercise_dictionary').insert(row);
  if (error) throw error;
}
