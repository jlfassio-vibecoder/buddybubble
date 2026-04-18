/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 3: The Coach (Equipment Matchmaker)
 * Fills patterns with specific exercises based on available equipment.
 */

import type {
  PatternSkeleton,
  ExerciseSelection,
  ProgramSchedule,
} from '@/lib/workout-factory/types/ai-program';

/** Extract exercise names from previous phase schedule for Coach context. */
function getPreviousPhaseExerciseNames(previousPhaseWorkouts: ProgramSchedule[]): string[] {
  const names = new Set<string>();
  for (const week of previousPhaseWorkouts) {
    for (const w of week.workouts ?? []) {
      const blocks = w.exerciseBlocks ?? (w.blocks ? [{ exercises: w.blocks }] : []);
      for (const b of blocks) {
        for (const e of b.exercises ?? []) {
          const name = (e as { exerciseName?: string }).exerciseName;
          if (name?.trim()) names.add(name.trim());
        }
      }
    }
  }
  return [...names];
}

/**
 * Build the prompt for Step 3: The Coach
 * When previousPhaseWorkouts is provided, includes context to progress from those exercises.
 */
export function buildCoachPrompt(
  patterns: PatternSkeleton,
  availableEquipment: string[],
  _hiitMode?: boolean,
  previousPhaseWorkouts?: ProgramSchedule[],
  options?: { kanbanBriefAuthoritative?: boolean },
): string {
  const briefAuth = !!options?.kanbanBriefAuthoritative;

  const daysDescription = patterns.days
    .map((day) => {
      const patternList = day.patterns
        .map((p) => `  - ${p.pattern} (${p.category}, ${p.priority})`)
        .join('\n');
      return `Day ${day.day_number}: ${day.day_name}\n${patternList}`;
    })
    .join('\n\n');

  const previousPhaseSection =
    previousPhaseWorkouts && previousPhaseWorkouts.length > 0
      ? `
=== PREVIOUS PHASE EXERCISES (progress from these) ===
Previous phase used: ${getPreviousPhaseExerciseNames(previousPhaseWorkouts).join(', ') || 'none'}
Consider progressing to harder variations or adding volume where appropriate.
`
      : '';

  const briefEquipmentPreamble = briefAuth
    ? `The Workout Architect already locked intent to a Kanban/Coach brief. The list below is a CONSTRAINT PHRASE, not a gym catalog—honor only equipment implied by that upstream brief when naming exercises.

`
    : '';

  return `Role: You are the Equipment Coach.
Task: Fill each movement pattern with a SPECIFIC exercise based on available equipment.

=== AVAILABLE EQUIPMENT ===
${briefEquipmentPreamble}${availableEquipment.length > 0 ? availableEquipment.join(', ') : 'Bodyweight only (no equipment)'}
${previousPhaseSection}
=== PATTERN SKELETON FROM BIOMECHANIST ===
${daysDescription}

=== YOUR TASK ===
For each pattern on each day, select the BEST exercise given the available equipment.

Examples:
- "Horizontal Push" (compound) + Barbell, Bench → "Barbell Bench Press"
- "Horizontal Push" (compound) + Dumbbells, Bench → "Dumbbell Bench Press"
- "Horizontal Push" (compound) + Bodyweight only → "Push-ups"
- "Knee Dominant" (isolation) + Resistance Bands → "Banded Terminal Knee Extensions"
- "Knee Dominant" (compound) + Bodyweight only → "Bodyweight Squats"

Rules:
1. ${briefAuth ? 'Only prescribe tools/modalities consistent with the Kanban workout brief that shaped the architect output (the list above restates that rule—do not invent barbell/rack work if the brief was bands-only).' : 'Only use equipment from the available list'}
2. Prioritize compound movements for "compound" category
3. Choose variations appropriate for the equipment
4. Add notes for any special considerations

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations.

{
  "selections": [
    {
      "day_number": 1,
      "day_name": "Upper Strength",
      "exercises": [
        {
          "pattern": "Horizontal Push",
          "exercise_name": "Barbell Bench Press",
          "equipment_used": "Barbell, Bench",
          "notes": "Primary chest builder"
        },
        {
          "pattern": "Horizontal Pull",
          "exercise_name": "Barbell Bent-Over Row",
          "equipment_used": "Barbell",
          "notes": "Keep back flat, pull to lower chest"
        }
      ]
    }
  ]
}

Generate exercise selections for all ${patterns.days.length} days.`;
}

/**
 * Validate Step 3 output
 */
export function validateCoachOutput(
  data: unknown,
  expectedDays: number,
): { valid: true; data: ExerciseSelection[] } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Coach output must be an object' };
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.selections)) {
    return { valid: false, error: 'selections must be an array' };
  }

  if (obj.selections.length !== expectedDays) {
    return {
      valid: false,
      error: `Expected ${expectedDays} day selections, got ${obj.selections.length}`,
    };
  }

  for (let i = 0; i < obj.selections.length; i++) {
    const selection = obj.selections[i] as Record<string, unknown>;

    if (typeof selection !== 'object' || selection === null) {
      return { valid: false, error: `Selection ${i + 1} must be an object` };
    }

    if (typeof selection.day_number !== 'number') {
      return { valid: false, error: `Selection ${i + 1}: day_number must be a number` };
    }

    if (typeof selection.day_name !== 'string') {
      return { valid: false, error: `Selection ${i + 1}: day_name is required` };
    }

    if (!Array.isArray(selection.exercises) || selection.exercises.length === 0) {
      return { valid: false, error: `Selection ${i + 1}: exercises must be a non-empty array` };
    }

    for (let j = 0; j < selection.exercises.length; j++) {
      const exercise = selection.exercises[j] as Record<string, unknown>;

      if (typeof exercise !== 'object' || exercise === null) {
        return { valid: false, error: `Day ${i + 1}, Exercise ${j + 1}: must be an object` };
      }

      if (typeof exercise.pattern !== 'string' || !exercise.pattern.trim()) {
        return { valid: false, error: `Day ${i + 1}, Exercise ${j + 1}: pattern is required` };
      }

      if (typeof exercise.exercise_name !== 'string' || !exercise.exercise_name.trim()) {
        return {
          valid: false,
          error: `Day ${i + 1}, Exercise ${j + 1}: exercise_name is required`,
        };
      }

      if (typeof exercise.equipment_used !== 'string') {
        return {
          valid: false,
          error: `Day ${i + 1}, Exercise ${j + 1}: equipment_used is required`,
        };
      }
    }
  }

  const selections: ExerciseSelection[] = (obj.selections as Record<string, unknown>[]).map(
    (s) => ({
      day_number: s.day_number as number,
      day_name: s.day_name as string,
      exercises: (s.exercises as Record<string, unknown>[]).map((e) => ({
        pattern: e.pattern as string,
        exercise_name: e.exercise_name as string,
        equipment_used: e.equipment_used as string,
        notes: (e.notes as string) || undefined,
      })),
    }),
  );

  return { valid: true, data: selections };
}
