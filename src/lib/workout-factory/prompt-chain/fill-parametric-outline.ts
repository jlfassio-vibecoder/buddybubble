/**
 * Stage 1 (parametric outline fill): Vertex prompt + output validation.
 */

import { INTERVAL_MODALITY_FACTORY_PROMPT } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import type { OutlineFillOutput } from '@/lib/workout-factory/types/outline-fill-types';
import {
  exercisePrescriptionRequired,
  graftFillBlocksOntoPreflight,
} from '@/lib/workout-factory/outline-block-preflight';
import { formatGenerationIntakeAdaptations } from '@/lib/workout-factory/workout-viewer-narrative';

function instructionLinesFromBlock(blk: Record<string, unknown>): string[] {
  if (!Array.isArray(blk.instructions)) return [];
  return blk.instructions
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isGraftedInstructionOnlyBlock(blk: Record<string, unknown>): boolean {
  const instructions = instructionLinesFromBlock(blk);
  if (instructions.length === 0) return false;
  if (!Array.isArray(blk.exercises)) return true;
  const named = blk.exercises.filter(
    (ex) =>
      ex &&
      typeof ex === 'object' &&
      !Array.isArray(ex) &&
      typeof (ex as { name?: unknown }).name === 'string' &&
      (ex as { name: string }).name.trim().length > 0,
  );
  return named.length === 0;
}

function exerciseHasPrescription(ex: Record<string, unknown>): boolean {
  const sets = ex.sets;
  const reps = ex.reps;
  const work = ex.work_seconds;
  if (typeof sets === 'number' && sets > 0) return true;
  if (typeof reps === 'string' && reps.trim().length > 0) return true;
  // Models frequently emit numeric reps (e.g. circuit/AMRAP exercises without "sets").
  // The downstream mapper coerces numeric reps via String(), so accept them here too.
  if (typeof reps === 'number' && Number.isFinite(reps) && reps > 0) return true;
  if (typeof work === 'number' && work > 0) return true;
  return false;
}

function mapGraftedBlockToFillOutput(
  blk: Record<string, unknown>,
): OutlineFillOutput['blocks'][number] {
  const row: OutlineFillOutput['blocks'][number] = {};
  if (typeof blk.name === 'string') row.name = blk.name;
  if (typeof blk.block_format === 'string') row.block_format = blk.block_format;
  if (
    blk.format_params &&
    typeof blk.format_params === 'object' &&
    !Array.isArray(blk.format_params)
  ) {
    row.format_params = blk.format_params as Record<string, unknown>;
  }
  if (Array.isArray(blk.instructions)) {
    row.instructions = blk.instructions.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(blk.exercises)) {
    row.exercises = blk.exercises
      .filter((ex) => ex && typeof ex === 'object' && !Array.isArray(ex))
      .map((ex) => {
        const e = ex as Record<string, unknown>;
        const out: NonNullable<OutlineFillOutput['blocks'][number]['exercises']>[number] = {
          name: String(e.name ?? '').trim(),
        };
        if (typeof e.sets === 'number') out.sets = e.sets;
        if (typeof e.reps === 'string') out.reps = e.reps;
        else if (typeof e.reps === 'number' && Number.isFinite(e.reps) && e.reps > 0)
          out.reps = String(e.reps);
        if (typeof e.equipment === 'string') out.equipment = e.equipment;
        if (typeof e.work_seconds === 'number') out.work_seconds = e.work_seconds;
        if (typeof e.rest_seconds === 'number') out.rest_seconds = e.rest_seconds;
        if (typeof e.rounds === 'number') out.rounds = e.rounds;
        if (typeof e.rpe === 'number') out.rpe = e.rpe;
        if (typeof e.coach_notes === 'string') out.coach_notes = e.coach_notes;
        return out;
      });
  }
  return row;
}

export function buildFillParametricOutlinePrompt(
  persona: WorkoutPersona,
  preflightBlocks: Record<string, unknown>[],
  equipmentList: string[],
  dailyCheckIn?: Record<string, unknown> | null,
): string {
  const title = persona.title?.trim() || '(no title)';
  const description = persona.description?.trim() || '';
  const intakeAdaptations = formatGenerationIntakeAdaptations(dailyCheckIn ?? null);
  const macroSection = intakeAdaptations
    ? `\n\nPre-session calibration (apply to prescriptions):\n${intakeAdaptations}`
    : '';
  const med =
    [
      persona.medical.injuries?.trim() && `Injuries: ${persona.medical.injuries}`,
      persona.medical.conditions?.trim() && `Conditions: ${persona.medical.conditions}`,
    ]
      .filter(Boolean)
      .join('\n') || 'None stated';

  const equipmentSection =
    equipmentList.length > 0
      ? equipmentList.map((item) => `- ${item}`).join('\n')
      : '(none listed — prefer bodyweight or brief-implied equipment only)';

  return `=== OUTLINE (READ-ONLY STRUCTURE) ===
${JSON.stringify(preflightBlocks, null, 2)}

=== INTAKE (AUTHORITATIVE TODAY) ===
Title: ${title}

Session context:
${description}${macroSection}

=== ATHLETE SAFETY ===
${med}

=== RESOLVED EQUIPMENT (AUTHORITATIVE) ===
${equipmentSection}

You must only prescribe exercises performable with the equipment listed above.

=== YOUR TASK ===
Fill each outline block in order with exercises or instruction lines appropriate for today's intake.
- Do NOT add, remove, or reorder blocks.
- Do NOT echo block names, block_format, or format_params — the server applies structure from the outline.
- Exercise-shaped blocks MUST include exercises[] with one entry per placeholder exercise in the outline (same count, same order).
- Instruction-only blocks: output instructions[] only (no exercises[], no block_format).
- For EMOM/Intervals (block_format tabata) blocks, movement names alone are sufficient when format_params carry timing; optional per-exercise work_seconds/rest_seconds/reps.
- For straight_sets, circuit, and other formats, include sets, reps, or work_seconds on each exercise.
- Scale volume and intensity to phase intent, progression trend, anchor lift, temporary limitations, and session duration from intake when present.

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations. Start with { and end with }.

{
  "blocks": [
    { "instructions": ["5 min easy bike", "Dynamic prep"] },
    {
      "exercises": [
        { "name": "Kettlebell Swing", "reps": "12", "work_seconds": 45, "rest_seconds": 15 }
      ]
    }
  ]
}`;
}

export function validateFillParametricOutlineOutput(
  data: unknown,
  preflightBlocks: Record<string, unknown>[],
): { valid: true; data: OutlineFillOutput } | { valid: false; error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'root must be an object' };
  }
  const root = data as Record<string, unknown>;
  const rawBlocks = root.blocks;
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return { valid: false, error: 'blocks must be a non-empty array' };
  }

  const modelBlocks: Record<string, unknown>[] = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    const b = rawBlocks[i];
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      return { valid: false, error: `blocks[${i}] must be an object` };
    }
    modelBlocks.push(b as Record<string, unknown>);
  }

  const graft = graftFillBlocksOntoPreflight(preflightBlocks, modelBlocks);
  if (!graft.ok) {
    return { valid: false, error: graft.error };
  }

  const graftedBlocks = graft.blocks;

  for (let i = 0; i < graftedBlocks.length; i++) {
    const blk = graftedBlocks[i]!;
    if (isGraftedInstructionOnlyBlock(blk)) continue;

    if (!Array.isArray(blk.exercises) || blk.exercises.length === 0) {
      return { valid: false, error: `blocks[${i}] missing exercises[]` };
    }

    const needsPrescription = exercisePrescriptionRequired(blk);

    for (let j = 0; j < blk.exercises.length; j++) {
      const exRaw = blk.exercises[j];
      if (!exRaw || typeof exRaw !== 'object' || Array.isArray(exRaw)) {
        return { valid: false, error: `blocks[${i}].exercises[${j}] invalid` };
      }
      const ex = exRaw as Record<string, unknown>;
      const name = typeof ex.name === 'string' ? ex.name.trim() : '';
      if (!name) {
        return { valid: false, error: `blocks[${i}].exercises[${j}] missing name` };
      }
      if (needsPrescription && !exerciseHasPrescription(ex)) {
        return {
          valid: false,
          error: `blocks[${i}].exercises[${j}] needs sets, reps, or work_seconds`,
        };
      }
    }
  }

  return {
    valid: true,
    data: {
      blocks: graftedBlocks.map(mapGraftedBlockToFillOutput),
    },
  };
}

export const FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT = `You are the Biomechanist and Mathematician. You are given a strict, pre-approved structural outline of workout blocks. Your job is to fill each block with specific exercises and prescriptions (or instruction lines) based on the user's intake, equipment, and profile.

${INTERVAL_MODALITY_FACTORY_PROMPT}

Do NOT add, remove, or reorder blocks. Do NOT echo block names, block_format, or format_params in your JSON — return fill content only (exercises[] and/or instructions[]) in outline order.

Instruction-only blocks (warm-up, cool-down, mobility) must remain instruction-only — output instructions[] only, never exercises[].

Output ONLY valid JSON matching the user-provided schema. No markdown, no commentary.`;
