/**
 * Step B (Kanban authoritative): add detailed + biomechanical coaching to extracted rows.
 */

import type { MedicalProfile } from '@/lib/workout-factory/types/ai-program';
import type {
  KanbanEnrichBiomechanicsOutput,
  KanbanEnrichedExercise,
  KanbanExtractBriefOutput,
} from '@/lib/workout-factory/types/kanban-extract-types';

export function buildEnrichWorkoutBiomechanicsPrompt(
  extract: KanbanExtractBriefOutput,
  medical: MedicalProfile,
  options?: { extractIsPartialSubset?: boolean },
): string {
  const med =
    [
      medical.injuries?.trim() && `Injuries: ${medical.injuries}`,
      medical.conditions?.trim() && `Conditions: ${medical.conditions}`,
    ]
      .filter(Boolean)
      .join('\n') || 'None stated';

  const subsetNote =
    options?.extractIsPartialSubset === true
      ? `\nNOTE: The "exercises" array is a SUBSET of the full workout — only movements that still need coaching. Process every row below; do not add exercises or change orders.\n`
      : '';

  return `=== EXTRACTED WORKOUT (READ-ONLY PRESCRIPTION) ===
${JSON.stringify(extract, null, 2)}
${subsetNote}
=== ATHLETE MEDICAL CONTEXT ===
${med}

=== YOUR TASK ===
For EACH object in "exercises" from the JSON above, output ONE matching object with the SAME "order" and SAME "exercise_name" (character-for-character match after trim).

Add coaching fields ONLY:
- "detailed_instructions": step-by-step how to perform the movement (string or array of short steps).
- "biomechanical_cues": deep form cues, muscle activation, bracing, ROM, tempo (string or array of bullets).
- "injury_prevention_tips": optional; how to avoid aggravating common issues for this pattern given medical context (string or array).

Rules:
1. Do NOT change exercise_name, sets, reps, equipment, rest_seconds, rpe, work_seconds, rounds, section, or order.
2. Do NOT add or remove exercises.
3. Keep language practical and accurate; avoid medical diagnosis.

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations. Start with { and end with }.

{
  "exercises": [
    {
      "order": 1,
      "exercise_name": "Example",
      "detailed_instructions": ["Step 1", "Step 2"],
      "biomechanical_cues": ["Cue A", "Cue B"],
      "injury_prevention_tips": "Optional"
    }
  ]
}`;
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function asStringArrayOrString(v: unknown): string | string[] | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.length === 1 ? parts[0]! : parts;
  }
  return undefined;
}

/** Validates Step B output against the extract slice used in the prompt (full extract or missing-only subset). */
export function validateEnrichWorkoutBiomechanicsOutput(
  data: unknown,
  extractSubset: KanbanExtractBriefOutput,
): { valid: true; data: KanbanEnrichBiomechanicsOutput } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Enrich output must be an object' };
  }
  const obj = data as Record<string, unknown>;
  const ex = obj.exercises;
  if (!Array.isArray(ex) || ex.length !== extractSubset.exercises.length) {
    return {
      valid: false,
      error: `enrich.exercises must be an array of length ${extractSubset.exercises.length}`,
    };
  }

  const byOrderExtract = new Map(extractSubset.exercises.map((e) => [e.order, e]));
  const out: KanbanEnrichedExercise[] = [];

  for (let i = 0; i < ex.length; i++) {
    const row = ex[i];
    if (typeof row !== 'object' || row === null) {
      return { valid: false, error: `exercises[${i}] must be an object` };
    }
    const e = row as Record<string, unknown>;
    if (typeof e.order !== 'number' || !Number.isInteger(e.order)) {
      return { valid: false, error: `exercises[${i}].order must be an integer` };
    }
    const src = byOrderExtract.get(e.order);
    if (!src) {
      return { valid: false, error: `exercises[${i}].order ${e.order} not found in extract` };
    }
    const ename =
      typeof e.exercise_name === 'string'
        ? e.exercise_name.trim()
        : typeof e.exercise_name === 'number'
          ? String(e.exercise_name).trim()
          : '';
    if (!ename || normName(ename) !== normName(src.exercise_name)) {
      return {
        valid: false,
        error: `exercises[${i}].exercise_name must match extract for order ${e.order}`,
      };
    }

    const detailed_instructions = asStringArrayOrString(e.detailed_instructions);
    const biomechanical_cues = asStringArrayOrString(e.biomechanical_cues);
    const injury_prevention_tips = asStringArrayOrString(e.injury_prevention_tips);

    if (!detailed_instructions && !biomechanical_cues && !injury_prevention_tips) {
      return {
        valid: false,
        error: `exercises[${i}] must include at least one of detailed_instructions, biomechanical_cues, injury_prevention_tips`,
      };
    }

    out.push({
      order: e.order,
      exercise_name: src.exercise_name,
      ...(detailed_instructions ? { detailed_instructions } : {}),
      ...(biomechanical_cues ? { biomechanical_cues } : {}),
      ...(injury_prevention_tips ? { injury_prevention_tips } : {}),
    });
  }

  out.sort((a, b) => a.order - b.order);
  return { valid: true, data: { exercises: out } };
}
