/**
 * Assembles WorkoutInSet + task metadata exercises from Kanban Extract + Enrich outputs.
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';
import type {
  KanbanEnrichBiomechanicsOutput,
  KanbanExtractBriefOutput,
} from '@/lib/workout-factory/types/kanban-extract-types';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';

function stringifyRich(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.join('\n') : v;
}

/**
 * Merges extract + enrich into BuddyBubble `metadata.exercises` rows (three-tier fields).
 */
export function mergeKanbanExtractEnrichToTaskExercises(
  extract: KanbanExtractBriefOutput,
  enrich: KanbanEnrichBiomechanicsOutput,
): WorkoutExercise[] {
  const enrichByOrder = new Map(enrich.exercises.map((e) => [e.order, e]));
  const ordered = [...extract.exercises].sort((a, b) => a.order - b.order);
  const out: WorkoutExercise[] = [];

  for (const ex of ordered) {
    const en = enrichByOrder.get(ex.order);
    const row: WorkoutExercise = { name: ex.exercise_name };

    if (typeof ex.sets === 'number' && ex.sets > 0) row.sets = ex.sets;
    const repsNorm = ex.reps != null ? normalizeRepsForStorage(ex.reps) : undefined;
    if (repsNorm !== undefined) row.reps = repsNorm;
    if (typeof ex.rpe === 'number') row.rpe = ex.rpe;
    if (typeof ex.rest_seconds === 'number' && ex.rest_seconds > 0) {
      row.rest_seconds = ex.rest_seconds;
    }
    if (typeof ex.work_seconds === 'number' && ex.work_seconds > 0) {
      row.work_seconds = ex.work_seconds;
    }
    if (typeof ex.rounds === 'number' && ex.rounds > 0) row.rounds = ex.rounds;
    if (ex.equipment?.trim()) row.equipment = ex.equipment.trim();
    if (ex.brief_note?.trim()) row.coach_notes = ex.brief_note.trim();

    if (en) {
      const instr = stringifyRich(en.detailed_instructions);
      if (instr) row.instructions = instr;
      const cues = en.biomechanical_cues;
      if (cues !== undefined) row.form_cues = cues;
      const inj = stringifyRich(en.injury_prevention_tips);
      if (inj) row.injury_prevention_tips = inj;
    }

    out.push(row);
  }
  return out;
}

function instructionLinesFromExtract(ex: {
  sets?: number | null;
  reps?: string | null;
  equipment?: string | null;
  brief_note?: string | null;
}): string[] {
  const lines: string[] = [];
  if (ex.brief_note?.trim()) lines.push(ex.brief_note.trim());
  if (ex.sets != null && ex.sets > 0 && ex.reps?.trim()) {
    lines.push(`${ex.sets} × ${ex.reps.trim()}`);
  } else if (ex.reps?.trim()) {
    lines.push(ex.reps.trim());
  }
  if (ex.equipment?.trim()) lines.push(`Equipment: ${ex.equipment.trim()}`);
  if (lines.length === 0) lines.push('As written in your workout brief.');
  return lines;
}

/**
 * Builds a single-session `WorkoutInSet` for `WorkoutSetTemplate.workouts[0]` (viewer / library shape).
 */
export function buildWorkoutInSetFromKanbanExtract(
  extract: KanbanExtractBriefOutput,
  persona: WorkoutPersona,
): WorkoutInSet {
  const title = extract.workout_title?.trim() || persona.title?.trim() || 'Workout';
  const description = extract.workout_description?.trim() || persona.description?.trim() || '';

  const warm = extract.exercises
    .filter((e) => e.section === 'warmup')
    .sort((a, b) => a.order - b.order);
  const main = extract.exercises
    .filter((e) => e.section === 'main')
    .sort((a, b) => a.order - b.order);
  const cool = extract.exercises
    .filter((e) => e.section === 'cooldown')
    .sort((a, b) => a.order - b.order);

  const warmupBlocks =
    warm.length > 0
      ? warm.map((ex, i) => ({
          order: i + 1,
          exerciseName: ex.exercise_name,
          instructions: instructionLinesFromExtract(ex),
        }))
      : undefined;

  const cooldownBlocks =
    cool.length > 0
      ? cool.map((ex, i) => ({
          order: i + 1,
          exerciseName: ex.exercise_name,
          instructions: instructionLinesFromExtract(ex),
        }))
      : undefined;

  const mainExercises: Exercise[] = main.map((ex, i) => {
    const sets = typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : 1;
    const repsRaw = ex.reps?.trim() ?? '';
    const reps = repsRaw || (ex.work_seconds ? String(ex.work_seconds) : '1');
    const exOut: Exercise = {
      order: i + 1,
      exerciseName: ex.exercise_name,
      sets,
      reps,
      ...(typeof ex.rpe === 'number' ? { rpe: ex.rpe } : {}),
      ...(typeof ex.rest_seconds === 'number' && ex.rest_seconds > 0
        ? { restSeconds: ex.rest_seconds }
        : {}),
      ...(typeof ex.work_seconds === 'number' && ex.work_seconds > 0
        ? { workSeconds: ex.work_seconds }
        : {}),
      ...(typeof ex.rounds === 'number' && ex.rounds > 0 ? { rounds: ex.rounds } : {}),
      ...(ex.brief_note?.trim() ? { coachNotes: ex.brief_note.trim() } : {}),
    };
    return exOut;
  });

  return {
    title,
    description,
    ...(warmupBlocks ? { warmupBlocks } : {}),
    exerciseBlocks: [{ order: 1, name: 'Main', exercises: mainExercises }],
    ...(cooldownBlocks ? { cooldownBlocks } : {}),
  };
}
