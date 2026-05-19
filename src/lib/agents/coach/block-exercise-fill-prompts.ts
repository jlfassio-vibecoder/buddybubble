/**
 * Prompts for Lane 2 block exercise-fill micro-call.
 * Mirror: `supabase/functions/agents/coach/block-exercise-fill-prompts.ts`.
 */

import type { CoachProposedBlockShell } from './block-blueprint-synthesize';

export function buildBlockExerciseFillSystemPrompt(): string {
  return (
    'You fill exercises[] for fixed workout block shells. The server already set block_format and format_params — do not change them.\n' +
    'Return JSON only: { "blocks": [{ "name": "...", "exercises": [{ "name": "...", "sets": number, "reps": "..." }] }] }.\n' +
    'Honor user qualifiers (bodyweight, core, kettlebell, etc.). Use real exercise names. Keep sets/reps concise.\n' +
    'Match block name exactly. Do not add blocks beyond those listed.'
  );
}

export function buildBlockExerciseFillUserText(args: {
  userMessage: string;
  shells: CoachProposedBlockShell[];
  workoutIndexSummary?: string | null;
}): string {
  const shellLines = args.shells.map((s) => JSON.stringify(s));
  const parts = [
    `User message:\n${args.userMessage.trim()}`,
    `Fixed block shells (structure is not editable):\n${shellLines.join('\n')}`,
  ];
  if (args.workoutIndexSummary?.trim()) {
    parts.push(`Existing workout sections (do not duplicate):\n${args.workoutIndexSummary.trim()}`);
  }
  return parts.join('\n\n');
}
