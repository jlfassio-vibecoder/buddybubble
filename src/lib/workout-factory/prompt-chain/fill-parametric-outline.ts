/**
 * Stage 1 (parametric outline fill): Vertex prompt + output validation.
 */

import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import type { OutlineFillOutput } from '@/lib/workout-factory/types/outline-fill-types';
import { assertFillPreservesStructure } from '@/lib/workout-factory/outline-block-preflight';

function instructionLinesFromBlock(blk: Record<string, unknown>): string[] {
  if (!Array.isArray(blk.instructions)) return [];
  return blk.instructions
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isInstructionOnlyBlock(blk: Record<string, unknown>): boolean {
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

export function buildFillParametricOutlinePrompt(
  persona: WorkoutPersona,
  preflightBlocks: Record<string, unknown>[],
  equipmentList: string[],
): string {
  const title = persona.title?.trim() || '(no title)';
  const description = persona.description?.trim() || '';
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
${description}

=== ATHLETE SAFETY ===
${med}

=== RESOLVED EQUIPMENT (AUTHORITATIVE) ===
${equipmentSection}

You must only prescribe exercises performable with the equipment listed above.

=== YOUR TASK ===
Fill the outline blocks with specific exercises, sets, reps, and work/rest intervals appropriate for today's intake.
- Do NOT add, remove, or reorder blocks.
- Do NOT change block_format or format_params on any block.
- Exercise-shaped blocks MUST include a populated exercises[] array with real movement names and prescriptions.
- Instruction-only blocks (instructions[] without exercises) may keep or lightly refine instruction lines only.
- Instruction-only blocks must NOT include block_format, format_params, or exercises[].
- Scale volume and intensity to phase intent, progression trend, anchor lift, temporary limitations, and session duration from intake when present.

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations. Start with { and end with }.

{
  "blocks": [
    {
      "name": "Warm-up",
      "instructions": ["5 min easy bike", "Dynamic prep"]
    },
    {
      "name": "Main EMOM",
      "block_format": "emom",
      "format_params": { "interval_seconds": 60, "total_minutes": 16, "is_alternating": true },
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

  const filledBlocks: Record<string, unknown>[] = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    const b = rawBlocks[i];
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      return { valid: false, error: `blocks[${i}] must be an object` };
    }
    filledBlocks.push(b as Record<string, unknown>);
  }

  const structureError = assertFillPreservesStructure(preflightBlocks, filledBlocks);
  if (structureError) {
    return { valid: false, error: structureError };
  }

  for (let i = 0; i < filledBlocks.length; i++) {
    const blk = filledBlocks[i]!;
    if (isInstructionOnlyBlock(blk)) continue;

    if (!Array.isArray(blk.exercises) || blk.exercises.length === 0) {
      return { valid: false, error: `blocks[${i}] missing exercises[]` };
    }

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
      if (!exerciseHasPrescription(ex)) {
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
      blocks: filledBlocks.map((blk) => {
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
              // Preserve numeric reps (coerced to string) instead of dropping them,
              // which would otherwise collapse a real rep target to the "1" default downstream.
              else if (typeof e.reps === 'number' && Number.isFinite(e.reps))
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
      }),
    },
  };
}

export const FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT = `You are the Biomechanist and Mathematician. You are given a strict, pre-approved structural outline of workout blocks. Your job is to fill these blocks with specific exercises, sets, reps, and work/rest intervals based on the user's intake, equipment, and profile. DO NOT add, remove, or reorder blocks. DO NOT change block_format or format_params.

Instruction-only blocks (warm-up, cool-down, mobility with instructions[] and no exercises[]) must remain instruction-only — never convert them into exercise prescriptions or add block_format.

Output ONLY valid JSON matching the user-provided schema. No markdown, no commentary.`;
