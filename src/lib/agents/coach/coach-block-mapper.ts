/**
 * Coach wire blocks (snake_case) → canvas `WorkoutSessionBlockView` (camelCase).
 * Production path merges proposed metadata into task metadata first (delta-safe).
 */

import type { Json } from '@/types/database';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import {
  buildWorkoutSessionViewModel,
  type WorkoutSessionBlockView,
} from '@/lib/workout-factory/workout-session-view-model';
import { formatBlockSubtitle } from '@/lib/workout-factory/format-block-subtitle';
import { isBlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import {
  classifyBlockRole,
  mergeCoachProposedIntoTaskMetadata,
} from '@/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import type { ProposedWorkoutMetadataView } from '@/lib/agents/coach/proposed-workout-metadata-view';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/** RPE 1–10; keeps half-steps (e.g. 7.5). */
function clampRpe(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 1 || v > 10) return null;
  return v;
}

function mapWireExercise(raw: unknown, order: number): Exercise | null {
  if (!isPlainObject(raw)) return null;
  const name =
    typeof raw.name === 'string'
      ? raw.name.trim()
      : typeof raw.exerciseName === 'string'
        ? raw.exerciseName.trim()
        : '';
  if (!name) return null;

  const sets = positiveInt(raw.sets) ?? 1;
  const reps =
    typeof raw.reps === 'string'
      ? raw.reps
      : typeof raw.reps === 'number' && Number.isFinite(raw.reps)
        ? String(raw.reps)
        : '';

  const ex: Exercise = { order, exerciseName: name, sets, reps };

  const rpe = clampRpe(raw.rpe);
  if (rpe != null) ex.rpe = rpe;
  const restSeconds = positiveInt(raw.rest_seconds ?? raw.restSeconds);
  if (restSeconds != null) ex.restSeconds = restSeconds;
  const workSeconds = positiveInt(raw.work_seconds ?? raw.workSeconds);
  if (workSeconds != null) ex.workSeconds = workSeconds;
  const rounds = positiveInt(raw.rounds);
  if (rounds != null) ex.rounds = rounds;
  if (typeof raw.coach_notes === 'string' && raw.coach_notes.trim()) {
    ex.coachNotes = raw.coach_notes.trim();
  } else if (typeof raw.coachNotes === 'string' && raw.coachNotes.trim()) {
    ex.coachNotes = raw.coachNotes.trim();
  }

  return ex;
}

function formatParamsFromWire(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  return { ...raw };
}

/**
 * Pure field mapper: Coach wire `blocks[]` → canvas views (no task-metadata merge).
 * Prefer `mapCoachProposedToCanvasBlocks` for live co-pilot deltas.
 */
export function mapCoachBlocksToCanvas(coachBlocks: unknown[]): WorkoutSessionBlockView[] {
  if (!Array.isArray(coachBlocks)) return [];

  const out: WorkoutSessionBlockView[] = [];
  let mainOrder = 0;
  let warmupOrder = 0;
  let finisherOrder = 0;
  let cooldownOrder = 0;

  for (let i = 0; i < coachBlocks.length; i++) {
    const raw = coachBlocks[i];
    if (!isPlainObject(raw)) continue;

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const instructions = Array.isArray(raw.instructions)
      ? raw.instructions
          .filter((x): x is string => typeof x === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const exercisesRaw = Array.isArray(raw.exercises) ? raw.exercises : [];
    const exercises = exercisesRaw
      .map((e, ei) => mapWireExercise(e, ei + 1))
      .filter((e): e is Exercise => e != null);

    const role = classifyBlockRole(name || (instructions.length > 0 ? 'Warm-up' : 'Main'));
    const instructionOnly = instructions.length > 0 && exercises.length === 0;

    if (instructionOnly || role !== 'main') {
      const section = role === 'main' ? 'warmup' : (role as 'warmup' | 'finisher' | 'cooldown');
      const order =
        section === 'warmup'
          ? ++warmupOrder
          : section === 'finisher'
            ? ++finisherOrder
            : ++cooldownOrder;
      out.push({
        id: `${section}-${order}-${i}`,
        section,
        order,
        name: name || section,
        blockFormat: null,
        formatParams: {},
        subtitle: null,
        exercises: [],
        instructions,
        instructionBlock: {
          order,
          exerciseName: name || section,
          instructions,
          id: `${section}-${order}-${i}`,
        },
      });
      continue;
    }

    if (exercises.length === 0 && !name) continue;

    const order = ++mainOrder;
    const formatRaw = raw.block_format ?? raw.blockFormat;
    const blockFormat = isBlockFormat(formatRaw) ? formatRaw : null;
    const formatParams = formatParamsFromWire(raw.format_params ?? raw.formatParams);
    const subtitle = formatBlockSubtitle(blockFormat, formatParams);

    out.push({
      id: `main-${order}-${i}`,
      section: 'main',
      order,
      name: name || 'Main work',
      blockFormat,
      formatParams,
      subtitle,
      exercises,
      instructions: [],
    });
  }

  return out;
}

/**
 * Production path: merge Coach proposed metadata into base task metadata, then
 * project the full rich session to canvas blocks (delta-safe).
 */
export function mapCoachProposedToCanvasBlocks(args: {
  proposed: ProposedWorkoutMetadataView;
  baseMetadata: unknown;
}): WorkoutSessionBlockView[] {
  const { metadata } = mergeCoachProposedIntoTaskMetadata({
    base: args.baseMetadata,
    proposed: args.proposed as Record<string, unknown>,
  });
  return buildWorkoutSessionViewModel(metadata as Json).blocks;
}
