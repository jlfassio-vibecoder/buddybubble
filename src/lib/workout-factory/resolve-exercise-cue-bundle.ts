import type { WorkoutExercise } from '@/lib/item-metadata';
import { normalizeExerciseDictionaryKey } from '@/lib/workout-factory/exercise-dictionary-bridge';
import { dictionaryRowToWorkoutExercise } from '@/lib/workout-factory/dictionary-row-to-workout-exercise';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { ExerciseDictionaryRow } from '@/types/database';
import type { UserExerciseNotesRow } from '@/lib/workout-factory/types/user-exercise-notes';

export type CueProvenance = 'workout' | 'personal' | 'flat' | 'library';

export type ResolvedCueField = {
  value: string;
  provenance: CueProvenance;
};

export type ResolvedCueBundle = {
  exerciseName: string;
  instructions: ResolvedCueField | null;
  form_cues: ResolvedCueField | null;
  tips: ResolvedCueField | null;
  injury_prevention_tips: ResolvedCueField | null;
  coach_notes: ResolvedCueField | null;
  isEmpty: boolean;
};

export type CollectedBlockExercise = {
  key: string;
  exerciseName: string;
  blockExercise?: Exercise;
  flatIndex: number;
};

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

/** Flat `WorkoutExercise` form_cues / form_cue normalization (mirrors WorkoutPlayerExercisePanel). */
export function formatFormCuesFromFlat(ex: WorkoutExercise): string | null {
  const raw = ex.form_cues;
  if (raw != null) {
    if (Array.isArray(raw)) {
      const parts = raw
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x.length > 0);
      if (parts.length > 0) return parts.join('\n');
    } else if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return trimNonEmpty(ex.form_cue);
}

export function exerciseResolutionKey(ex: {
  id?: string;
  exerciseName?: string;
  name?: string;
}): string {
  if (ex.id?.trim()) return ex.id.trim();
  const name = (ex.exerciseName ?? ex.name ?? '').trim();
  return name ? normalizeExerciseDictionaryKey(name) : '';
}

/** Flat-list key: prefer `id`, else disambiguate duplicate names by index. */
export function flatExerciseResolutionKey(ex: WorkoutExercise, flatIndex: number): string {
  if (ex.id?.trim()) return ex.id.trim();
  const name = ex.name?.trim();
  const base = name ? normalizeExerciseDictionaryKey(name) : 'exercise';
  return `${base}::${flatIndex}`;
}

export function collectBlockExercises(blocks: WorkoutSessionBlockView[]): CollectedBlockExercise[] {
  const out: CollectedBlockExercise[] = [];
  let flatIndex = 0;
  const mainBlocks = blocks
    .filter((b) => b.section === 'main')
    .slice()
    .sort((a, b) => a.order - b.order);

  for (const block of mainBlocks) {
    for (const ex of block.exercises) {
      const exerciseName = ex.exerciseName?.trim() || 'Exercise';
      out.push({
        key: exerciseResolutionKey(ex),
        exerciseName,
        blockExercise: ex,
        flatIndex,
      });
      flatIndex += 1;
    }
  }
  return out;
}

export function collectFlatOnlyExercises(flat: WorkoutExercise[]): CollectedBlockExercise[] {
  return flat.map((ex, flatIndex) => {
    const exerciseName = ex.name?.trim() || 'Exercise';
    return {
      key: flatExerciseResolutionKey(ex, flatIndex),
      exerciseName,
      flatIndex,
    };
  });
}

export function indexFlatExercisesByName(flat: WorkoutExercise[]): Map<string, WorkoutExercise[]> {
  const byName = new Map<string, WorkoutExercise[]>();
  for (const ex of flat) {
    const k = normalizeExerciseDictionaryKey(ex.name ?? '');
    if (!k) continue;
    const list = byName.get(k) ?? [];
    list.push(ex);
    byName.set(k, list);
  }
  return byName;
}

export function matchFlatExerciseForCollected(
  collected: CollectedBlockExercise,
  flatByName: Map<string, WorkoutExercise[]>,
  flat: WorkoutExercise[],
): WorkoutExercise | undefined {
  const byName = flatByName.get(normalizeExerciseDictionaryKey(collected.exerciseName));
  if (byName && byName.length === 1) return byName[0];
  if (byName && byName.length > 1) {
    return byName[collected.flatIndex] ?? byName[0];
  }
  return flat[collected.flatIndex];
}

export function catalogCuesFromDictionaryRow(row: ExerciseDictionaryRow): {
  instructions: string | null;
  form_cues: string | null;
  tips: string | null;
  injury_prevention_tips: string | null;
  coach_notes: string | null;
} {
  const mapped = dictionaryRowToWorkoutExercise(row);
  return {
    instructions: trimNonEmpty(mapped.instructions) ?? trimNonEmpty(mapped.notes),
    form_cues: formatFormCuesFromFlat(mapped),
    tips: trimNonEmpty(mapped.tips),
    injury_prevention_tips: stringifyRich(mapped.injury_prevention_tips),
    coach_notes: trimNonEmpty(mapped.coach_notes),
  };
}

function pickField(
  candidates: { value: string | null; provenance: CueProvenance }[],
): ResolvedCueField | null {
  for (const c of candidates) {
    const v = trimNonEmpty(c.value);
    if (v) return { value: v, provenance: c.provenance };
  }
  return null;
}

export type ResolveExerciseCueBundleInput = {
  exerciseName: string;
  blockExercise?: Exercise;
  flatRow?: WorkoutExercise;
  personalRow?: UserExerciseNotesRow | null;
  dictRow?: ExerciseDictionaryRow | null;
};

export function resolveExerciseCueBundle(input: ResolveExerciseCueBundleInput): ResolvedCueBundle {
  const catalog = input.dictRow ? catalogCuesFromDictionaryRow(input.dictRow) : null;
  const flat = input.flatRow;
  const personal = input.personalRow ?? null;
  const block = input.blockExercise;

  const flatInstructions = trimNonEmpty(flat?.instructions) ?? trimNonEmpty(flat?.notes);
  const flatForm = flat ? formatFormCuesFromFlat(flat) : null;
  const flatTips = trimNonEmpty(flat?.tips);
  const flatInjury = flat ? stringifyRich(flat.injury_prevention_tips) : null;
  const flatCoach = trimNonEmpty(flat?.coach_notes);

  const instructions = pickField([
    { value: personal?.instructions ?? null, provenance: 'personal' },
    { value: flatInstructions, provenance: 'flat' },
    { value: catalog?.instructions ?? null, provenance: 'library' },
  ]);

  const form_cues = pickField([
    { value: personal?.form_cues ?? null, provenance: 'personal' },
    { value: flatForm, provenance: 'flat' },
    { value: catalog?.form_cues ?? null, provenance: 'library' },
  ]);

  const tips = pickField([
    { value: personal?.tips ?? null, provenance: 'personal' },
    { value: flatTips, provenance: 'flat' },
    { value: catalog?.tips ?? null, provenance: 'library' },
  ]);

  const injury_prevention_tips = pickField([
    { value: personal?.injury_prevention_tips ?? null, provenance: 'personal' },
    { value: flatInjury, provenance: 'flat' },
    { value: catalog?.injury_prevention_tips ?? null, provenance: 'library' },
  ]);

  const coach_notes = pickField([
    { value: block?.coachNotes ?? null, provenance: 'workout' },
    { value: flatCoach, provenance: 'flat' },
    { value: catalog?.coach_notes ?? null, provenance: 'library' },
  ]);

  const bundle: ResolvedCueBundle = {
    exerciseName: input.exerciseName,
    instructions,
    form_cues,
    tips,
    injury_prevention_tips,
    coach_notes,
    isEmpty: false,
  };

  bundle.isEmpty = !(instructions || form_cues || tips || injury_prevention_tips || coach_notes);

  return bundle;
}

export function emptyResolvedCueBundle(exerciseName: string): ResolvedCueBundle {
  return {
    exerciseName,
    instructions: null,
    form_cues: null,
    tips: null,
    injury_prevention_tips: null,
    coach_notes: null,
    isEmpty: true,
  };
}
