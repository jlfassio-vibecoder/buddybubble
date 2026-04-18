/**
 * Step A (Kanban authoritative): extract structured prescription from Coach brief only.
 */

import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import type {
  KanbanBriefSection,
  KanbanExtractBriefOutput,
  KanbanExtractedExercise,
} from '@/lib/workout-factory/types/kanban-extract-types';

const SECTIONS: readonly KanbanBriefSection[] = ['warmup', 'main', 'cooldown'];

function isSection(s: unknown): s is KanbanBriefSection {
  return typeof s === 'string' && (SECTIONS as readonly string[]).includes(s);
}

export function buildExtractWorkoutFromBriefPrompt(persona: WorkoutPersona): string {
  const title = persona.title?.trim() || '(no title)';
  const description = persona.description?.trim() || '';
  const med =
    [
      persona.medical.injuries?.trim() && `Injuries: ${persona.medical.injuries}`,
      persona.medical.conditions?.trim() && `Conditions: ${persona.medical.conditions}`,
    ]
      .filter(Boolean)
      .join('\n') || 'None stated';

  return `=== WORKOUT BRIEF (AUTHORITATIVE) ===
Title: ${title}

Description:
${description}

Safety context (do NOT change the prescription; use only if the brief is ambiguous about contraindications):
${med}

=== YOUR TASK ===
Extract a SINGLE workout exactly as written in the Description. Do NOT invent exercises, substitute modalities, or split into multiple days/sessions.

1. Classify each line or numbered item into section "warmup", "main", or "cooldown" using the brief's structure (e.g. headers "Warm-up", "Main", "Cool-down"). If unclear, put strength/circuit items in "main" and generic prep in "warmup".
2. Preserve exercise ORDER as in the brief. Assign "order" as 1,2,3,... globally across all sections.
3. For each exercise: copy the name as "exercise_name" (concise, as in the brief). Extract sets, reps, equipment, rest, RPE, work_seconds, rounds ONLY if explicitly stated or clearly implied next to that exercise.
4. If reps are a time hold (e.g. "30-60 seconds"), put that text in "reps" and omit sets or use sets: 1.
5. "equipment": short string (e.g. "Dumbbell", "Barbell", "Suspension trainer") inferred only from the brief for that movement.

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations. Start with { and end with }.

{
  "workout_title": "optional short title if the brief implies one",
  "workout_description": "optional one-line summary",
  "exercises": [
    {
      "order": 1,
      "section": "warmup",
      "exercise_name": "Light cardio bike",
      "sets": null,
      "reps": "5 minutes",
      "equipment": "Bike",
      "rest_seconds": null,
      "rpe": null,
      "work_seconds": null,
      "rounds": null,
      "brief_note": null
    },
    {
      "order": 2,
      "section": "main",
      "exercise_name": "Dumbbell Goblet Squat",
      "sets": 3,
      "reps": "10-12",
      "equipment": "Dumbbell",
      "rest_seconds": 75,
      "rpe": 7,
      "work_seconds": null,
      "rounds": null,
      "brief_note": null
    }
  ]
}

You MUST include at least one exercise with "section": "main".`;
}

export function validateExtractWorkoutFromBriefOutput(
  data: unknown,
): { valid: true; data: KanbanExtractBriefOutput } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Extract output must be an object' };
  }
  const obj = data as Record<string, unknown>;
  const exercisesRaw = obj.exercises;
  if (!Array.isArray(exercisesRaw) || exercisesRaw.length < 1) {
    return { valid: false, error: 'exercises must be a non-empty array' };
  }

  const workout_title =
    typeof obj.workout_title === 'string' && obj.workout_title.trim()
      ? obj.workout_title.trim()
      : undefined;
  const workout_description =
    typeof obj.workout_description === 'string' && obj.workout_description.trim()
      ? obj.workout_description.trim()
      : undefined;

  const exercises: KanbanExtractedExercise[] = [];
  const seenOrders = new Set<number>();
  let mainCount = 0;

  for (let i = 0; i < exercisesRaw.length; i++) {
    const row = exercisesRaw[i];
    if (typeof row !== 'object' || row === null) {
      return { valid: false, error: `exercises[${i}] must be an object` };
    }
    const e = row as Record<string, unknown>;
    if (typeof e.order !== 'number' || !Number.isInteger(e.order) || e.order < 1) {
      return { valid: false, error: `exercises[${i}].order must be a positive integer` };
    }
    if (seenOrders.has(e.order)) {
      return { valid: false, error: `duplicate exercises[].order: ${e.order}` };
    }
    seenOrders.add(e.order);

    if (!isSection(e.section)) {
      return { valid: false, error: `exercises[${i}].section must be warmup | main | cooldown` };
    }
    const name =
      typeof e.exercise_name === 'string'
        ? e.exercise_name.trim()
        : typeof e.exercise_name === 'number'
          ? String(e.exercise_name).trim()
          : '';
    if (!name) {
      return { valid: false, error: `exercises[${i}].exercise_name is required` };
    }

    if (e.section === 'main') mainCount++;

    const sets =
      typeof e.sets === 'number' && Number.isFinite(e.sets) && e.sets > 0
        ? Math.floor(e.sets)
        : null;
    const reps = typeof e.reps === 'string' && e.reps.trim() ? e.reps.trim() : null;
    const equipment =
      typeof e.equipment === 'string' && e.equipment.trim() ? e.equipment.trim() : null;
    const rest_seconds =
      typeof e.rest_seconds === 'number' && e.rest_seconds > 0 ? Math.floor(e.rest_seconds) : null;
    const rpe = typeof e.rpe === 'number' && e.rpe >= 1 && e.rpe <= 10 ? Math.round(e.rpe) : null;
    const work_seconds =
      typeof e.work_seconds === 'number' && e.work_seconds > 0 ? Math.floor(e.work_seconds) : null;
    const rounds = typeof e.rounds === 'number' && e.rounds > 0 ? Math.floor(e.rounds) : null;
    const brief_note =
      typeof e.brief_note === 'string' && e.brief_note.trim() ? e.brief_note.trim() : null;

    let repsResolved = reps;
    let setsResolved = sets;
    if (sets === null && reps === null && work_seconds === null) {
      if (e.section === 'main') {
        return {
          valid: false,
          error: `exercises[${i}] (main) must include at least one of sets, reps, or work_seconds`,
        };
      }
      repsResolved = 'As in brief';
    }

    exercises.push({
      order: e.order,
      section: e.section,
      exercise_name: name,
      sets: setsResolved,
      reps: repsResolved,
      equipment,
      rest_seconds,
      rpe,
      work_seconds,
      rounds,
      brief_note,
    });
  }

  exercises.sort((a, b) => a.order - b.order);

  if (mainCount < 1) {
    return { valid: false, error: 'At least one exercise must have section "main"' };
  }

  return {
    valid: true,
    data: {
      ...(workout_title ? { workout_title } : {}),
      ...(workout_description ? { workout_description } : {}),
      exercises,
    },
  };
}
