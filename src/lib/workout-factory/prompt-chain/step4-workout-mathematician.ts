/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 4: The Workout Mathematician
 * Generates a single set of workouts (1–N sessions) with sets, reps, RPE, rest.
 * No week-by-week schedule — one prescription per session.
 */

import type {
  WorkoutArchitectBlueprint,
  BlockOptions,
  HiitOptions,
  AmrapDensityOptions,
  TabataBalancedOptions,
} from '@/lib/workout-factory/types/ai-workout';
import {
  TABATA_BALANCED_REST_SECONDS,
  TABATA_BALANCED_WORK_SECONDS,
  tabataBalancedExerciseCount,
  tabataBalancedRoundsPerExercise,
} from '@/lib/workout-factory/tabata-balanced-duration';
import type {
  ExerciseSelection,
  ProgressionProtocol,
} from '@/lib/workout-factory/types/ai-program';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';

function isAmrapProtocol(hiitOptions?: HiitOptions): boolean {
  return hiitOptions?.protocolFormat === 'amrap';
}

const defaultBlockOptions: BlockOptions = {
  includeWarmup: true,
  mainBlockCount: 1,
  includeFinisher: false,
  includeCooldown: false,
};

/**
 * Build the prompt for Step 4: Workout Mathematician
 * When hiitMode and hiitOptions are set, requests Timer Schema (workSeconds, restSeconds, rounds) instead of sets/reps.
 */
export function buildWorkoutMathematicianPrompt(
  architect: WorkoutArchitectBlueprint,
  exercises: ExerciseSelection[],
  blockOptions: BlockOptions = defaultBlockOptions,
  hiitMode?: boolean,
  hiitOptions?: HiitOptions,
  amrapDensityMode?: boolean,
  amrapDensityOptions?: AmrapDensityOptions,
  tabataBalancedMode?: boolean,
  tabataBalancedOptions?: TabataBalancedOptions,
): string {
  const exercisesDescription = exercises
    .map((day) => {
      const exerciseList = day.exercises
        .map((e) => `  - ${e.exercise_name} (${e.pattern})`)
        .join('\n');
      return `Session ${day.day_number}: ${day.day_name}\n${exerciseList}`;
    })
    .join('\n\n');

  const sessionCount = architect.sessions.length;

  const effectiveBlockOptions: BlockOptions =
    amrapDensityMode || tabataBalancedMode
      ? {
          includeWarmup: false,
          mainBlockCount: 1,
          includeFinisher: false,
          includeCooldown: false,
        }
      : hiitMode && hiitOptions
        ? isAmrapProtocol(hiitOptions)
          ? {
              includeWarmup: false,
              mainBlockCount: 1,
              includeFinisher: false,
              includeCooldown: false,
            }
          : (() => {
              const circuitCount = [
                hiitOptions.circuitStructure.circuit1,
                hiitOptions.circuitStructure.circuit2,
                hiitOptions.circuitStructure.circuit3,
              ].filter(Boolean).length;
              const mainBlockCount = circuitCount >= 1 ? circuitCount : 1;
              return {
                includeWarmup: hiitOptions.circuitStructure.includeWarmup,
                mainBlockCount: mainBlockCount as 1 | 2 | 3, // Clamped above; HIIT has at most 3 circuits. BlockOptions accepts 1|2|3|4|5.
                includeFinisher: false,
                includeCooldown: hiitOptions.circuitStructure.includeCooldown,
              };
            })()
        : blockOptions;

  const { includeWarmup, mainBlockCount, includeFinisher, includeCooldown } = effectiveBlockOptions;

  const protocolInstructions = getProtocolInstructions(architect.progression_protocol);

  const warmupTask = includeWarmup
    ? '3. warmupBlocks: 2–4 warmup exercises with instructions (order, exerciseName, instructions array)'
    : '3. warmupBlocks: omit or set to empty array []';
  const tabataRoundsPerEx =
    tabataBalancedMode && tabataBalancedOptions
      ? tabataBalancedRoundsPerExercise(
          tabataBalancedOptions.pairingPattern,
          tabataBalancedOptions.roundCount,
        )
      : 0;

  const mainTask = amrapDensityMode
    ? `4. exerciseBlocks: exactly 1 block (Density-Based AMRAP circuit). Each exercise: order, exerciseName, exerciseQuery, sets (always 1 per station per lap), reps (fixed count, e.g. "10"), restSeconds (0 — continuous transition to next station), rpe (optional), coachNotes. FORBID workSeconds and any timed-station prescription. FORBID non-zero restSeconds between stations. The athlete repeats the full exercise list for the session clock, completing as many laps as possible. Primary tracking metric: Total Laps Completed.`
    : tabataBalancedMode && tabataBalancedOptions
      ? `4. exerciseBlocks: exactly 1 block (Balanced Tabata). Each exercise: order, exerciseName, exerciseQuery, workSeconds (${TABATA_BALANCED_WORK_SECONDS} only), restSeconds (${TABATA_BALANCED_REST_SECONDS} only), rounds (each exercise: exactly ${tabataRoundsPerEx} — equal share of ${tabataBalancedOptions.roundCount} total work intervals), coachNotes. TIMER SCHEMA only. FORBID sets/reps. The athlete performs ${tabataBalancedOptions.roundCount} work intervals of ${TABATA_BALANCED_WORK_SECONDS}s; pairing pattern ${tabataBalancedOptions.pairingPattern} determines how many distinct exercises rotate.`
      : hiitMode && hiitOptions && isAmrapProtocol(hiitOptions)
        ? `4. exerciseBlocks: exactly 1 block (the AMRAP circuit). Each exercise: order, exerciseName, exerciseQuery, workSeconds, restSeconds, rounds, coachNotes. TIMER SCHEMA only — set rounds to 1 for every exercise (one work interval at that station per lap). The athlete repeats the full circuit for the session duration, completing as many laps as possible — do not prescribe fixed multi-round work at a single station (e.g. never use rounds > 1 to mean "three times through this exercise before moving on").`
        : hiitMode
          ? `4. exerciseBlocks: exactly ${mainBlockCount} block(s); each block has order, name, and exercises with order, exerciseName, exerciseQuery, workSeconds, restSeconds, rounds, coachNotes (TIMER SCHEMA — no sets/reps; use work/rest time and rounds)`
          : `4. exerciseBlocks: exactly ${mainBlockCount} block(s); each block has order, name, and exercises with order, exerciseName, exerciseQuery (searchable), sets, reps, rpe, restSeconds, coachNotes`;
  const finisherTask = includeFinisher
    ? '5. finisherBlocks: 1–3 finisher exercises (same shape as warmupBlocks: order, exerciseName, instructions)'
    : '';
  const cooldownTask = includeCooldown
    ? '6. cooldownBlocks: 2–4 cool-down exercises (same shape as warmupBlocks: order, exerciseName, instructions)'
    : '';
  const taskLines = [warmupTask, mainTask].concat(
    finisherTask ? [finisherTask] : [],
    cooldownTask ? [cooldownTask] : [],
  );

  const warmupExample = includeWarmup
    ? `"warmupBlocks": [
        { "order": 1, "exerciseName": "Arm Circles", "instructions": ["10 forward", "10 backward"] },
        { "order": 2, "exerciseName": "Band Pull-Aparts", "instructions": ["15 reps", "Squeeze shoulder blades"] }
      ],`
    : '"warmupBlocks": [],';

  const mainBlocksExample = amrapDensityMode
    ? `        {
          "order": 1,
          "name": "Density AMRAP Circuit",
          "exercises": [
            {
              "order": 1,
              "exerciseName": "Kettlebell Goblet Squat",
              "exerciseQuery": "goblet squat",
              "sets": 1,
              "reps": "12",
              "restSeconds": 0,
              "coachNotes": "One station per lap; Total Laps Completed is the primary metric"
            },
            {
              "order": 2,
              "exerciseName": "Push-ups",
              "exerciseQuery": "push-up",
              "sets": 1,
              "reps": "10",
              "restSeconds": 0,
              "coachNotes": "Continuous lap — no timed station blocks"
            }
          ]
        }`
    : tabataBalancedMode && tabataBalancedOptions
      ? `        {
          "order": 1,
          "name": "Balanced Tabata",
          "exercises": [
            {
              "order": 1,
              "exerciseName": "Dumbbell Floor Press",
              "exerciseQuery": "floor press",
              "workSeconds": 20,
              "restSeconds": 10,
              "rounds": ${tabataRoundsPerEx},
              "coachNotes": "Antagonist pair example — alternate with pull pattern"
            },
            {
              "order": 2,
              "exerciseName": "Inverted Row",
              "exerciseQuery": "inverted row",
              "workSeconds": 20,
              "restSeconds": 10,
              "rounds": ${tabataRoundsPerEx},
              "coachNotes": "Match pairing pattern from Architect (${tabataBalancedOptions.pairingPattern})"
            }
          ]
        }`
      : hiitMode
        ? hiitOptions && isAmrapProtocol(hiitOptions)
          ? `        {
          "order": 1,
          "name": "Upper Body AMRAP",
          "exercises": [
            {
              "order": 1,
              "exerciseName": "Push-ups",
              "exerciseQuery": "push-up",
              "workSeconds": 40,
              "restSeconds": 20,
              "rounds": 1,
              "coachNotes": "One work bout per lap; repeat entire circuit for session time"
            },
            {
              "order": 2,
              "exerciseName": "Inverted Row",
              "exerciseQuery": "inverted row",
              "workSeconds": 40,
              "restSeconds": 20,
              "rounds": 1,
              "coachNotes": "One work bout per lap"
            }
          ]
        }`
          : Array.from({ length: mainBlockCount }, (_, i) => {
              const name =
                mainBlockCount === 1
                  ? 'Main'
                  : i === 0
                    ? 'Circuit 1 (Driver)'
                    : i === 1
                      ? 'Circuit 2 (Sustainer)'
                      : 'Circuit 3 (Burnout)';
              return `        {
          "order": ${i + 1},
          "name": "${name}",
          "exercises": [
            {
              "order": 1,
              "exerciseName": "Burpees",
              "exerciseQuery": "burpee",
              "workSeconds": 40,
              "restSeconds": 20,
              "rounds": 4,
              "coachNotes": "Full effort each interval"
            }
          ]
        }`;
            }).join(',\n')
        : Array.from({ length: mainBlockCount }, (_, i) => {
            const name = mainBlockCount === 1 ? 'Main' : `Block ${i + 1}`;
            return `        {
          "order": ${i + 1},
          "name": "${name}",
          "exercises": [
            {
              "order": 1,
              "exerciseName": "Barbell Bench Press",
              "exerciseQuery": "bench press",
              "sets": 3,
              "reps": "8-10",
              "rpe": 7,
              "restSeconds": 120,
              "coachNotes": "Control descent, drive up"
            }
          ]
        }`;
          }).join(',\n');

  const finisherExample = includeFinisher
    ? `,
      "finisherBlocks": [
        { "order": 1, "exerciseName": "Plank", "instructions": ["30-45 sec"] }
      ]`
    : '';
  const cooldownExample = includeCooldown
    ? `,
      "cooldownBlocks": [
        { "order": 1, "exerciseName": "Static Stretch Chest", "instructions": ["30 sec each side"] },
        { "order": 2, "exerciseName": "Cat-Cow", "instructions": ["8 reps"] }
      ]`
    : '';

  const densitySection =
    amrapDensityMode && amrapDensityOptions
      ? `
=== DENSITY-BASED AMRAP ===
Protocol: ${amrapDensityOptions.protocolFormat}. Movement transition: ${amrapDensityOptions.workRestRatio} (continuous lap; no station clocks).
Session tier: ${amrapDensityOptions.sessionDurationTier}. Prescribe a single repeating loop for the fixed session clock.

- Omit warmupBlocks, finisherBlocks, and cooldownBlocks (use [] for each). Host-delivered prep and recovery stay outside this JSON.
- Each exercise is one station in the lap. Use fixed repetition counts only (sets/reps schema). FORBID workSeconds and FORBID non-zero restSeconds between stations (use restSeconds: 0).
- Primary tracking metric: Total Laps Completed. Do not describe timed station blocks or countdown splits in coachNotes.
`
      : '';

  const tabataBalancedSection =
    tabataBalancedMode && tabataBalancedOptions
      ? `
=== BALANCED TABATA (20s / 10s) ===
Total work intervals: ${tabataBalancedOptions.roundCount}. Pairing: ${tabataBalancedOptions.pairingPattern}.
- Each main exercise MUST use workSeconds: ${TABATA_BALANCED_WORK_SECONDS}, restSeconds: ${TABATA_BALANCED_REST_SECONDS}.
- Each exercise's rounds MUST equal ${tabataRoundsPerEx} (total intervals ${tabataBalancedOptions.roundCount} ÷ ${tabataBalancedExerciseCount(tabataBalancedOptions.pairingPattern)} exercise(s)).
- Include exactly ${tabataBalancedExerciseCount(tabataBalancedOptions.pairingPattern)} exercise(s) in the single block (order defines rotation).
- Omit warmupBlocks, finisherBlocks, and cooldownBlocks (use [] for each).
`
      : '';

  const hiitSection =
    hiitMode && hiitOptions
      ? isAmrapProtocol(hiitOptions)
        ? `
=== AMRAP (AS MANY ROUNDS AS POSSIBLE) ===
Session time is fixed (see Architect session duration). The athlete completes as many full laps of the exercise list as possible before time expires.

- Output ONLY interval work: a single exerciseBlocks array with exactly one block. Omit warmupBlocks, finisherBlocks, and cooldownBlocks from the prescription (use [] for each). Warm-up and cool-down are delivered by the trainer/host outside this generated workout.
- Each exercise is one station in the repeating circuit. Use workSeconds and restSeconds per station. Set rounds to 1 for every exercise (one timed work bout at that station per lap). Do NOT use rounds to mean "perform this station N times before moving on" — that is not AMRAP.
- Do NOT use sets/reps for main work.
`
        : `
=== HIIT / TIMER SCHEMA ===
Protocol: ${hiitOptions.protocolFormat}${hiitOptions.workRestRatio ? `, Work:Rest ${hiitOptions.workRestRatio}` : ''}
Prescribe each main-block exercise with workSeconds, restSeconds, and rounds. Do NOT use sets and reps for main work.
`
      : '';

  const taskInstruction = amrapDensityMode
    ? `Use the Coach's exercise list in order as one repeating Density-Based AMRAP circuit. For each exercise use sets: 1, fixed reps, restSeconds: 0. State Total Laps Completed as the primary metric in workout description. FORBID workSeconds.`
    : tabataBalancedMode && tabataBalancedOptions
      ? `Use the Coach's exercise list. Build exactly one Tabata block with ${tabataBalancedExerciseCount(tabataBalancedOptions.pairingPattern)} exercises, each with workSeconds ${TABATA_BALANCED_WORK_SECONDS}, restSeconds ${TABATA_BALANCED_REST_SECONDS}, rounds ${tabataRoundsPerEx}. Describe rotation in workout description. FORBID sets/reps in main block.`
      : hiitMode && hiitOptions && isAmrapProtocol(hiitOptions)
        ? `Use the Coach's exercise list in order as one repeating AMRAP circuit. Prescribe workSeconds, restSeconds, and rounds=1 for each exercise.`
        : hiitMode
          ? `Use the Coach's exercise list. Prescribe workSeconds, restSeconds, and rounds per exercise to fit the session duration and protocol. Distribute exercises across exactly ${mainBlockCount} circuit block(s).`
          : `Use the Coach's exercise list for that session. Prescribe sets, reps, RPE, and rest appropriate to the progression protocol and session duration. Distribute exercises across exactly ${mainBlockCount} main block(s).`;

  return `Role: You are the Workout Mathematician.
Task: Generate ONE set of ${sessionCount} workouts (no weeks). Each workout is a complete session. Include blocks as specified below.

=== PROGRESSION PROTOCOL: ${architect.progression_protocol.toUpperCase()} ===
${protocolInstructions}

Architect's Rules:
- Accumulation: ${architect.progression_rules.weeks_1_3}
- Intensification: ${architect.progression_rules.weeks_4_6}
${densitySection}${tabataBalancedSection}${hiitSection}

=== SESSIONS FROM ARCHITECT ===
${architect.sessions.map((s) => `Session ${s.session_number}: ${s.session_name} — ${s.focus} (${s.duration_minutes} min)`).join('\n')}

=== EXERCISES FROM COACH ===
${exercisesDescription}

=== YOUR TASK ===
For each of the ${sessionCount} sessions, output ONE workout with:
1. title (e.g. "Session 1: Upper Strength")
2. description (brief focus)
${taskLines.map((line) => line).join('\n')}

${taskInstruction}

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown. Start with { and end with }.

{
  "workouts": [
    {
      "title": "Session 1: Upper Strength",
      "description": "Horizontal push/pull emphasis",
      ${warmupExample}
      "exerciseBlocks": [
${mainBlocksExample}
      ]${finisherExample}${cooldownExample}
    }
  ]
}

Output exactly ${sessionCount} workouts, one per session.`;
}

function getProtocolInstructions(protocol: ProgressionProtocol): string {
  switch (protocol) {
    case 'linear_load':
      return `- Fixed reps (e.g. 5x5), add load over time. RPE 6-7 to start.`;
    case 'double_progression':
      return `- Use rep range (e.g. 8-12). Add reps first, then add weight. RPE 7-9.`;
    case 'density_leverage':
      return `- Add sets/reps or reduce rest. Progress variations in coachNotes.`;
    default:
      return 'Apply progressive overload appropriately.';
  }
}

function validateWarmupLikeBlocks(
  arr: unknown,
  workoutIndex: number,
  blockLabel: string,
): { valid: false; error: string } | null {
  if (!Array.isArray(arr) || arr.length === 0)
    return {
      valid: false,
      error: `Workout ${workoutIndex + 1}: ${blockLabel} must be a non-empty array`,
    };
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as Record<string, unknown>;
    if (typeof item !== 'object' || item === null)
      return {
        valid: false,
        error: `Workout ${workoutIndex + 1}, ${blockLabel} item ${i + 1}: must be an object`,
      };
    if (typeof item.order !== 'number')
      return {
        valid: false,
        error: `Workout ${workoutIndex + 1}, ${blockLabel} item ${i + 1}: order is required`,
      };
    if (typeof item.exerciseName !== 'string' || !String(item.exerciseName || '').trim())
      return {
        valid: false,
        error: `Workout ${workoutIndex + 1}, ${blockLabel} item ${i + 1}: exerciseName is required`,
      };
    if (!Array.isArray(item.instructions))
      return {
        valid: false,
        error: `Workout ${workoutIndex + 1}, ${blockLabel} item ${i + 1}: instructions array is required`,
      };
  }
  return null;
}

/**
 * Resolve effective block options for validation (HIIT uses circuit structure for block count)
 */
function getEffectiveBlockOptionsForValidation(
  blockOptions: BlockOptions,
  amrapDensityMode?: boolean,
  hiitMode?: boolean,
  hiitOptions?: HiitOptions,
  tabataBalancedMode?: boolean,
): BlockOptions {
  if (amrapDensityMode || tabataBalancedMode) {
    return {
      includeWarmup: false,
      mainBlockCount: 1,
      includeFinisher: false,
      includeCooldown: false,
    };
  }
  if (!hiitMode || !hiitOptions) return blockOptions;
  if (isAmrapProtocol(hiitOptions)) {
    return {
      includeWarmup: false,
      mainBlockCount: 1,
      includeFinisher: false,
      includeCooldown: false,
    };
  }
  const circuitCount = [
    hiitOptions.circuitStructure.circuit1,
    hiitOptions.circuitStructure.circuit2,
    hiitOptions.circuitStructure.circuit3,
  ].filter(Boolean).length;
  // HIIT has at most 3 circuits; ensure at least 1 so BlockOptions.mainBlockCount is never 0.
  const mainBlockCount = circuitCount >= 1 ? circuitCount : 1;
  return {
    includeWarmup: hiitOptions.circuitStructure.includeWarmup,
    mainBlockCount: mainBlockCount as 1 | 2 | 3 | 4 | 5,
    includeFinisher: false,
    includeCooldown: hiitOptions.circuitStructure.includeCooldown,
  };
}

/**
 * Validate Step 4 Workout Mathematician output (single layer of workouts)
 * When hiitMode is true, exercises are validated for Timer Schema (workSeconds, restSeconds, rounds) instead of sets/reps.
 */
export function validateWorkoutMathematicianOutput(
  data: unknown,
  expectedWorkoutCount: number,
  blockOptions: BlockOptions = defaultBlockOptions,
  hiitMode?: boolean,
  hiitOptions?: HiitOptions,
  amrapDensityMode?: boolean,
  tabataBalancedMode?: boolean,
  tabataBalancedOptions?: TabataBalancedOptions,
): { valid: true; data: WorkoutInSet[] } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Workout mathematician output must be an object' };
  }

  const obj = data as Record<string, unknown>;
  const effectiveOptions = getEffectiveBlockOptionsForValidation(
    blockOptions,
    amrapDensityMode,
    hiitMode,
    hiitOptions,
    tabataBalancedMode,
  );
  const { includeWarmup, mainBlockCount, includeFinisher, includeCooldown } = effectiveOptions;

  if (!Array.isArray(obj.workouts)) {
    return { valid: false, error: 'workouts must be an array' };
  }

  if (obj.workouts.length !== expectedWorkoutCount) {
    return {
      valid: false,
      error: `Expected ${expectedWorkoutCount} workouts, got ${obj.workouts.length}`,
    };
  }

  for (let j = 0; j < obj.workouts.length; j++) {
    const workout = obj.workouts[j] as Record<string, unknown>;

    if (typeof workout !== 'object' || workout === null) {
      return { valid: false, error: `Workout ${j + 1}: must be an object` };
    }

    if (typeof workout.title !== 'string' || !workout.title.trim()) {
      return { valid: false, error: `Workout ${j + 1}: title is required` };
    }

    if (typeof workout.description !== 'string' || !workout.description.trim()) {
      return { valid: false, error: `Workout ${j + 1}: description is required` };
    }

    if (
      amrapDensityMode ||
      tabataBalancedMode ||
      (hiitMode && hiitOptions && isAmrapProtocol(hiitOptions))
    ) {
      const metabolicNoAuxLabel = tabataBalancedMode
        ? 'Balanced Tabata'
        : amrapDensityMode
          ? 'Density AMRAP'
          : 'HIIT AMRAP';
      const wb = workout.warmupBlocks;
      if (Array.isArray(wb) && wb.length > 0) {
        return {
          valid: false,
          error: `Workout ${j + 1}: ${metabolicNoAuxLabel} requires empty warmupBlocks (warm-up is outside generated programming)`,
        };
      }
      const fb = workout.finisherBlocks;
      if (Array.isArray(fb) && fb.length > 0) {
        return {
          valid: false,
          error: `Workout ${j + 1}: ${metabolicNoAuxLabel} requires empty finisherBlocks`,
        };
      }
      const cb = workout.cooldownBlocks;
      if (Array.isArray(cb) && cb.length > 0) {
        return {
          valid: false,
          error: `Workout ${j + 1}: ${metabolicNoAuxLabel} requires empty cooldownBlocks (cool-down is outside generated programming)`,
        };
      }
    }

    if (includeWarmup) {
      const warmup = workout.warmupBlocks;
      // Prompt guides 2–4 warmup exercises; we allow minimum 1 to avoid unnecessary regeneration when AI outputs a single warmup.
      if (!Array.isArray(warmup) || warmup.length < 1) {
        return {
          valid: false,
          error: `Workout ${j + 1}: warmupBlocks must have at least 1 exercise when includeWarmup is true`,
        };
      }
    }

    const exerciseBlocks = workout.exerciseBlocks as
      | Array<{ exercises?: Array<Record<string, unknown>> }>
      | undefined;
    const blocks = workout.blocks as Array<Record<string, unknown>> | undefined;

    if (exerciseBlocks && Array.isArray(exerciseBlocks)) {
      if (exerciseBlocks.length !== mainBlockCount) {
        return {
          valid: false,
          error: `Workout ${j + 1}: expected exactly ${mainBlockCount} exercise block(s), got ${exerciseBlocks.length}`,
        };
      }
      for (let k = 0; k < exerciseBlocks.length; k++) {
        const block = exerciseBlocks[k];
        const exercises = block?.exercises;
        if (!Array.isArray(exercises)) {
          return {
            valid: false,
            error: `Workout ${j + 1}, Block ${k + 1}: exercises array is required`,
          };
        }
        for (let e = 0; e < exercises.length; e++) {
          const ex = exercises[e] as Record<string, unknown>;
          if (typeof ex !== 'object' || ex === null) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: must be an object`,
            };
          }
          if (typeof ex.exerciseName !== 'string' || !String(ex.exerciseName || '').trim()) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: exerciseName is required`,
            };
          }
          if (amrapDensityMode) {
            if (ex.workSeconds != null) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: workSeconds must not be set for Density-Based AMRAP`,
              };
            }
            if (typeof ex.sets !== 'number' || ex.sets !== 1) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: sets must be 1 for Density-Based AMRAP (one completion per station per lap)`,
              };
            }
            if (typeof ex.reps !== 'string' && typeof ex.reps !== 'number') {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: reps is required for Density-Based AMRAP`,
              };
            }
            const rs = ex.restSeconds;
            if (typeof rs === 'number' && rs !== 0) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: restSeconds must be 0 for Density-Based AMRAP`,
              };
            }
          } else if (tabataBalancedMode && tabataBalancedOptions) {
            const expectedRounds = tabataBalancedRoundsPerExercise(
              tabataBalancedOptions.pairingPattern,
              tabataBalancedOptions.roundCount,
            );
            if (ex.workSeconds !== TABATA_BALANCED_WORK_SECONDS) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: workSeconds must be ${TABATA_BALANCED_WORK_SECONDS} for Balanced Tabata`,
              };
            }
            if (ex.restSeconds !== TABATA_BALANCED_REST_SECONDS) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: restSeconds must be ${TABATA_BALANCED_REST_SECONDS} for Balanced Tabata`,
              };
            }
            if (typeof ex.rounds !== 'number' || ex.rounds !== expectedRounds) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: rounds must be ${expectedRounds} for Balanced Tabata`,
              };
            }
            if (ex.sets != null || ex.reps != null) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: sets/reps must not be used for Balanced Tabata (timer schema only)`,
              };
            }
          } else if (hiitMode) {
            if (typeof ex.workSeconds !== 'number' || ex.workSeconds < 1) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: workSeconds is required (positive number) for HIIT`,
              };
            }
            if (typeof ex.restSeconds !== 'number' || ex.restSeconds < 0) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: restSeconds is required for HIIT`,
              };
            }
            if (typeof ex.rounds !== 'number' || ex.rounds < 1) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: rounds is required (positive number) for HIIT`,
              };
            }
            if (hiitOptions && isAmrapProtocol(hiitOptions) && ex.rounds !== 1) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: AMRAP requires rounds: 1 (one work bout per station per lap)`,
              };
            }
          } else {
            if (typeof ex.sets !== 'number' || ex.sets < 1) {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: sets must be a positive number`,
              };
            }
            if (typeof ex.reps !== 'string' && typeof ex.reps !== 'number') {
              return {
                valid: false,
                error: `Workout ${j + 1}, Block ${k + 1}, Exercise ${e + 1}: reps is required`,
              };
            }
          }
        }
        if (tabataBalancedMode && tabataBalancedOptions) {
          const blockExercises = exerciseBlocks[k]?.exercises;
          const expectedN = tabataBalancedExerciseCount(tabataBalancedOptions.pairingPattern);
          if (Array.isArray(blockExercises) && blockExercises.length !== expectedN) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: Balanced Tabata requires exactly ${expectedN} exercise(s) for pairing ${tabataBalancedOptions.pairingPattern}`,
            };
          }
        }
      }
    } else if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      if (blocks.length !== mainBlockCount) {
        return {
          valid: false,
          error: `Workout ${j + 1}: expected exactly ${mainBlockCount} block(s), got ${blocks.length}`,
        };
      }
      for (let k = 0; k < blocks.length; k++) {
        const block = blocks[k];
        if (typeof block !== 'object' || block === null) {
          return {
            valid: false,
            error: `Workout ${j + 1}, Block ${k + 1}: must be an object`,
          };
        }
        if (typeof block.exerciseName !== 'string' || !(block.exerciseName as string).trim()) {
          return {
            valid: false,
            error: `Workout ${j + 1}, Block ${k + 1}: exerciseName is required`,
          };
        }
        if (amrapDensityMode) {
          if (block.workSeconds != null) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: workSeconds must not be set for Density-Based AMRAP`,
            };
          }
          if (typeof block.sets !== 'number' || (block.sets as number) !== 1) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: sets must be 1 for Density-Based AMRAP`,
            };
          }
          if (typeof block.reps !== 'string' && typeof block.reps !== 'number') {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: reps is required for Density-Based AMRAP`,
            };
          }
          const brs = block.restSeconds;
          if (typeof brs === 'number' && brs !== 0) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: restSeconds must be 0 for Density-Based AMRAP`,
            };
          }
        } else if (tabataBalancedMode && tabataBalancedOptions) {
          const expectedRounds = tabataBalancedRoundsPerExercise(
            tabataBalancedOptions.pairingPattern,
            tabataBalancedOptions.roundCount,
          );
          if ((block.workSeconds as number) !== TABATA_BALANCED_WORK_SECONDS) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: workSeconds must be ${TABATA_BALANCED_WORK_SECONDS} for Balanced Tabata`,
            };
          }
          if ((block.restSeconds as number) !== TABATA_BALANCED_REST_SECONDS) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: restSeconds must be ${TABATA_BALANCED_REST_SECONDS} for Balanced Tabata`,
            };
          }
          if ((block.rounds as number) !== expectedRounds) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: rounds must be ${expectedRounds} for Balanced Tabata`,
            };
          }
        } else if (hiitMode) {
          if (typeof block.workSeconds !== 'number' || (block.workSeconds as number) < 1) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: workSeconds is required for HIIT`,
            };
          }
          if (typeof block.restSeconds !== 'number' || (block.restSeconds as number) < 0) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: restSeconds is required for HIIT`,
            };
          }
          if (typeof block.rounds !== 'number' || (block.rounds as number) < 1) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: rounds is required for HIIT`,
            };
          }
          if (hiitOptions && isAmrapProtocol(hiitOptions) && (block.rounds as number) !== 1) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: AMRAP requires rounds: 1`,
            };
          }
        } else {
          if (typeof block.sets !== 'number' || (block.sets as number) < 1) {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: sets must be a positive number`,
            };
          }
          if (typeof block.reps !== 'string' && typeof block.reps !== 'number') {
            return {
              valid: false,
              error: `Workout ${j + 1}, Block ${k + 1}: reps is required`,
            };
          }
        }
      }
    } else {
      return {
        valid: false,
        error: `Workout ${j + 1}: must have exactly ${mainBlockCount} exercise block(s)`,
      };
    }

    if (includeFinisher) {
      const err = validateWarmupLikeBlocks(workout.finisherBlocks, j, 'finisherBlocks');
      if (err) return err;
    }
    if (includeCooldown) {
      const err = validateWarmupLikeBlocks(workout.cooldownBlocks, j, 'cooldownBlocks');
      if (err) return err;
    }
  }

  return { valid: true, data: obj.workouts as WorkoutInSet[] };
}
