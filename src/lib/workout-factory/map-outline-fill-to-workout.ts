/**
 * Assembles WorkoutInSet from parametric outline fill output.
 */

import { hydrateEmomAlternatingStations } from '@/lib/agents/_shared/workout-metadata/hydrate-emom-alternating-stations';
import { classifyBlockRole } from '@/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import { isBlockFormat, normalizeFormatParams } from '@/lib/agents/coach/block-blueprint-library';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutPersona, WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';
import type {
  Exercise,
  ExerciseBlock,
  WarmupBlock,
} from '@/lib/workout-factory/types/workout-contract';

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function instructionLinesFromBlock(blk: Record<string, unknown>): string[] {
  if (!Array.isArray(blk.instructions)) return [];
  return blk.instructions
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function mapOutlineExerciseToFactory(ex: Record<string, unknown>, order: number): Exercise | null {
  const name = typeof ex.name === 'string' ? ex.name.trim() : '';
  if (!name) return null;
  const sets = typeof ex.sets === 'number' && ex.sets > 0 ? Math.round(ex.sets) : 1;
  const repsRaw = ex.reps;
  const reps = repsRaw == null ? '' : typeof repsRaw === 'string' ? repsRaw : String(repsRaw);
  const row: Exercise = {
    order,
    exerciseName: name,
    sets,
    reps: reps.trim() || (typeof ex.work_seconds === 'number' ? String(ex.work_seconds) : '1'),
  };
  if (typeof ex.rpe === 'number' && Number.isFinite(ex.rpe)) row.rpe = ex.rpe;
  if (typeof ex.rest_seconds === 'number' && ex.rest_seconds >= 0)
    row.restSeconds = ex.rest_seconds;
  if (typeof ex.work_seconds === 'number' && ex.work_seconds > 0) row.workSeconds = ex.work_seconds;
  if (typeof ex.rounds === 'number' && ex.rounds > 0) row.rounds = Math.round(ex.rounds);
  if (typeof ex.instructions === 'string' && ex.instructions.trim())
    row.instructions = ex.instructions.trim();
  if (typeof ex.form_cues === 'string' && ex.form_cues.trim()) row.formCues = ex.form_cues.trim();
  else if (typeof ex.formCues === 'string' && ex.formCues.trim()) row.formCues = ex.formCues.trim();
  if (typeof ex.tips === 'string' && ex.tips.trim()) row.tips = ex.tips.trim();
  if (typeof ex.injury_prevention_tips === 'string' && ex.injury_prevention_tips.trim()) {
    row.injuryPreventionTips = ex.injury_prevention_tips.trim();
  } else if (typeof ex.injuryPreventionTips === 'string' && ex.injuryPreventionTips.trim()) {
    row.injuryPreventionTips = ex.injuryPreventionTips.trim();
  }
  if (typeof ex.coach_notes === 'string' && ex.coach_notes.trim())
    row.coachNotes = ex.coach_notes.trim();
  else if (typeof ex.coachNotes === 'string' && ex.coachNotes.trim())
    row.coachNotes = ex.coachNotes.trim();
  return row;
}

function hydrateEmomExercisesFromFormatParams(
  exercises: Exercise[],
  formatParams: Record<string, unknown>,
): void {
  const interval =
    typeof formatParams.interval_seconds === 'number' ? formatParams.interval_seconds : null;
  const restInInterval =
    typeof formatParams.rest_in_interval_seconds === 'number'
      ? formatParams.rest_in_interval_seconds
      : 0;
  if (!interval || interval <= 0) return;
  const derivedWork = Math.max(0, interval - Math.max(0, restInInterval));
  const derivedRest = Math.max(0, restInInterval);
  for (const ex of exercises) {
    if (typeof ex.workSeconds !== 'number') ex.workSeconds = derivedWork;
    if (typeof ex.restSeconds !== 'number') ex.restSeconds = derivedRest;
  }
}

function hydrateTabataExercisesFromFormatParams(
  exercises: Exercise[],
  formatParams: Record<string, unknown>,
): void {
  const rounds = positiveInt(formatParams.rounds);
  const work = positiveInt(formatParams.work_seconds);
  const rest = positiveInt(formatParams.rest_seconds);
  for (const ex of exercises) {
    if (rounds != null && typeof ex.rounds !== 'number') ex.rounds = rounds;
    if (work != null && typeof ex.workSeconds !== 'number') ex.workSeconds = work;
    if (rest != null && typeof ex.restSeconds !== 'number') ex.restSeconds = rest;
    ex.sets = 1;
    ex.reps = '';
  }
}

function nextInstructionOrder(arr: WarmupBlock[]): number {
  let max = 0;
  for (const row of arr) {
    if (row.order > max) max = row.order;
  }
  return max + 1;
}

export function buildWorkoutInSetFromOutlineFill(
  blocks: Record<string, unknown>[],
  persona: WorkoutPersona,
): WorkoutInSet {
  const title = persona.title?.trim() || 'Workout';

  const warmupBlocks: WarmupBlock[] = [];
  const finisherBlocks: WarmupBlock[] = [];
  const cooldownBlocks: WarmupBlock[] = [];
  const exerciseBlocks: ExerciseBlock[] = [];
  let exerciseBlockOrder = 0;

  for (const blk of blocks) {
    const blockName = typeof blk.name === 'string' ? blk.name.trim() : 'Block';
    const role = classifyBlockRole(blockName);
    const instructions = instructionLinesFromBlock(blk);
    const rawExercises = Array.isArray(blk.exercises) ? blk.exercises : [];
    const mapped: Exercise[] = [];
    let ord = 0;
    for (const exRaw of rawExercises) {
      if (!exRaw || typeof exRaw !== 'object' || Array.isArray(exRaw)) continue;
      ord += 1;
      const fe = mapOutlineExerciseToFactory(exRaw as Record<string, unknown>, ord);
      if (fe) mapped.push(fe);
    }

    if (mapped.length === 0 && instructions.length > 0) {
      const row: WarmupBlock = {
        order: 0,
        exerciseName: blockName,
        instructions,
      };
      if (role === 'warmup') {
        row.order = nextInstructionOrder(warmupBlocks);
        warmupBlocks.push(row);
      } else if (role === 'finisher') {
        row.order = nextInstructionOrder(finisherBlocks);
        finisherBlocks.push(row);
      } else if (role === 'cooldown') {
        row.order = nextInstructionOrder(cooldownBlocks);
        cooldownBlocks.push(row);
      }
      continue;
    }

    if (mapped.length === 0) continue;

    exerciseBlockOrder += 1;
    const blockFormatRaw = blk.block_format;
    const blockFormat = isBlockFormat(blockFormatRaw) ? blockFormatRaw : 'straight_sets';
    let formatParams = normalizeFormatParams(blockFormat, blk.format_params);

    if (blockFormat === 'emom') {
      formatParams = hydrateEmomAlternatingStations(mapped.length, formatParams);
      hydrateEmomExercisesFromFormatParams(mapped, formatParams);
    }
    if (blockFormat === 'tabata') {
      hydrateTabataExercisesFromFormatParams(mapped, formatParams);
    }

    const block: ExerciseBlock = {
      order: exerciseBlockOrder,
      name: blockName,
      exercises: mapped,
      blockFormat,
      ...(Object.keys(formatParams).length > 0 ? { formatParams } : {}),
    };
    exerciseBlocks.push(block);
  }

  // CRITICAL pre-return: ensure alternating_stations on EMOM blocks
  for (const block of exerciseBlocks) {
    if (block.blockFormat !== 'emom' || !block.formatParams) continue;
    const fp = block.formatParams;
    if (fp.is_alternating === true) {
      block.formatParams = hydrateEmomAlternatingStations(
        block.exercises.length,
        fp as Record<string, unknown>,
      );
    }
  }

  return {
    title,
    description: '',
    ...(warmupBlocks.length > 0 ? { warmupBlocks } : {}),
    ...(exerciseBlocks.length > 0 ? { exerciseBlocks } : {}),
    ...(finisherBlocks.length > 0 ? { finisherBlocks } : {}),
    ...(cooldownBlocks.length > 0 ? { cooldownBlocks } : {}),
  };
}

export function outlineFillToTaskExercises(workoutInSet: WorkoutInSet): WorkoutExercise[] {
  return workoutInSetToTaskExercises(workoutInSet).map((row) => {
    if (row.reps != null) {
      const norm = normalizeRepsForStorage(row.reps);
      if (norm !== undefined) return { ...row, reps: norm };
    }
    return row;
  });
}
