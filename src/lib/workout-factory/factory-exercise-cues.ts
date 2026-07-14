/**
 * Factory `Exercise` cue field helpers (M5) — camelCase SoT ↔ snake_case flat / patches.
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { formatFormCuesFromFlat } from '@/lib/workout-factory/resolve-exercise-cue-bundle';

/** Snake_case cue patch shape (matches WorkoutCuePatch; kept local to avoid import cycles). */
export type FactoryCuePatch = Partial<{
  instructions: string;
  form_cues: string;
  tips: string;
  injury_prevention_tips: string;
  coach_notes: string;
}>;

/** Patch snake_case key → factory camelCase key. */
export const FACTORY_CUE_FIELD_MAP = [
  { patch: 'instructions', factory: 'instructions' },
  { patch: 'form_cues', factory: 'formCues' },
  { patch: 'tips', factory: 'tips' },
  { patch: 'injury_prevention_tips', factory: 'injuryPreventionTips' },
  { patch: 'coach_notes', factory: 'coachNotes' },
] as const satisfies ReadonlyArray<{
  patch: keyof FactoryCuePatch;
  factory: keyof Exercise;
}>;
function trimNonEmpty(s: string | null | undefined): string | null {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > 0 ? t : null;
}

function stringifyRich(v: string | string[] | undefined | null): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : null;
  }
  return trimNonEmpty(v);
}

/** Apply a workout cue patch onto a factory Exercise (mutates). */
export function applyCuePatchToFactoryExercise(ex: Exercise, patch: FactoryCuePatch): void {
  for (const { patch: patchKey, factory: factoryKey } of FACTORY_CUE_FIELD_MAP) {
    if (!(patchKey in patch)) continue;
    const raw = patch[patchKey];
    const val = typeof raw === 'string' ? raw.trim() : '';
    if (val) {
      (ex as unknown as Record<string, unknown>)[factoryKey] = val;
    } else {
      delete (ex as unknown as Record<string, unknown>)[factoryKey];
    }
  }
}

/** Read a single factory cue field as a trimmed string (or null). */
export function factoryCueFieldValue(
  ex: Exercise | undefined,
  factoryKey: (typeof FACTORY_CUE_FIELD_MAP)[number]['factory'],
): string | null {
  if (!ex) return null;
  return trimNonEmpty(ex[factoryKey] as string | undefined);
}

/** Copy non-empty flat cue fields onto a factory Exercise when factory fields are empty. */
export function copyFlatCuesOntoFactoryExercise(ex: Exercise, flat: WorkoutExercise): void {
  const instructions = trimNonEmpty(flat.instructions) ?? trimNonEmpty(flat.notes);
  if (instructions && !trimNonEmpty(ex.instructions)) ex.instructions = instructions;

  const formCues = formatFormCuesFromFlat(flat);
  if (formCues && !trimNonEmpty(ex.formCues)) ex.formCues = formCues;

  const tips = trimNonEmpty(flat.tips);
  if (tips && !trimNonEmpty(ex.tips)) ex.tips = tips;

  const injury = stringifyRich(flat.injury_prevention_tips);
  if (injury && !trimNonEmpty(ex.injuryPreventionTips)) ex.injuryPreventionTips = injury;

  const coach = trimNonEmpty(flat.coach_notes);
  if (coach && !trimNonEmpty(ex.coachNotes)) ex.coachNotes = coach;
}

/** Project factory cue fields onto a flat WorkoutExercise (mutates base). */
export function projectFactoryCuesOntoFlat(ex: Exercise, base: WorkoutExercise): void {
  if (ex.instructions?.trim()) base.instructions = ex.instructions.trim();
  if (ex.formCues?.trim()) base.form_cues = ex.formCues.trim();
  if (ex.tips?.trim()) base.tips = ex.tips.trim();
  if (ex.injuryPreventionTips?.trim()) base.injury_prevention_tips = ex.injuryPreventionTips.trim();
  if (ex.coachNotes?.trim()) base.coach_notes = ex.coachNotes.trim();
}

/** Copy cue fields from a view/factory Exercise onto a new factory Exercise row. */
export function copyFactoryCueFields(from: Exercise, to: Exercise): void {
  if (from.instructions?.trim()) to.instructions = from.instructions.trim();
  if (from.formCues?.trim()) to.formCues = from.formCues.trim();
  if (from.tips?.trim()) to.tips = from.tips.trim();
  if (from.injuryPreventionTips?.trim()) {
    to.injuryPreventionTips = from.injuryPreventionTips.trim();
  }
  if (from.coachNotes?.trim()) to.coachNotes = from.coachNotes.trim();
}

/** Map flat WorkoutExercise cue columns onto a factory Exercise. */
export function copyFlatCuesToFactoryFields(we: WorkoutExercise, ex: Exercise): void {
  copyFlatCuesOntoFactoryExercise(ex, we);
}
